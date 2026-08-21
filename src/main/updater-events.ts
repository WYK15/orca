import { app, autoUpdater as nativeUpdater } from 'electron'
import type { UpdateStatus } from '../shared/update-status-types'
import {
  consumeMacInstallGuardBypass,
  deferMacQuitUntilInstallerReady,
  handleMacInstallerReady,
  isMacInstallerReady,
  isMacQuitAndInstallInFlight,
  resetMacInstallState
} from './updater-mac-install'
import type { ReleaseUpdateDelivery } from './updater-delivery-policy'
import { compareVersions } from './updater-fallback'
import { registerUpdateAvailableHandler } from './updater-available-event'
import type { ElectronAutoUpdater } from './electron-updater-loader'
import { recordUpdaterLifecycle } from './updater-lifecycle-diagnostics'
import {
  captureLinuxPackageArtifact,
  clearTrackedLinuxPackageArtifact,
  clearTrackedLinuxPackageArtifactForOtherVersion
} from './linux-package-update-recovery'

const AUTO_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const AUTO_UPDATE_RETRY_INTERVAL_MS = 60 * 60 * 1000

export type UpdaterHandlerContext = {
  autoUpdater: ElectronAutoUpdater
  clearBackgroundCheckLaunchPending: () => void
  clearAvailableUpdateContext: () => void
  consumeMissingManifestPrereleaseFallbackResult: () => { userInitiated: boolean } | null
  getPublishingWindowLastGoodCheck: () => { lastGoodTag: string } | null
  getMissingManifestPrereleaseFallbackUserInitiated: () => boolean | null
  getCurrentStatus: () => UpdateStatus
  getActiveUpdateCheckEventAttemptId: () => number | null
  getKnownReleaseUrl: () => string | undefined
  getPendingInstallVersion: () => string
  getReleaseUpdateDelivery: () => ReleaseUpdateDelivery
  getUserInitiatedCheck: () => boolean
  handleQuitAndInstallFailure: (error?: unknown) => boolean
  isQuitAndInstallHandoffActive: () => boolean
  hasInstallableDownloadedVersion: () => boolean
  isLocalBuildCheck: () => boolean
  isPinnedBuildCheck: () => boolean
  shouldHandleUpdaterErrorEvent: () => boolean
  clearUpdateAvailableEventPending: (attemptId: number | null) => void
  isActiveUpdateCheckAttempt: (attemptId: number) => boolean
  markUpdateCheckEventAttempt: () => boolean
  markUpdateAvailableEventPending: (attemptId: number | null) => void
  markMissingManifestPrereleaseFallbackChecking: () => void
  performQuitAndInstall: () => void | Promise<void>
  shouldDeferMacQuitForInstall: () => boolean
  recordCompletedUpdateCheck: () => void
  restoreReleaseUpdateSource: () => void
  sendCheckFailureStatus: (
    message: string,
    userInitiated?: boolean,
    source?: 'event' | 'promise' | 'fallback-promise',
    sourceError?: unknown
  ) => Promise<void>
  sendErrorStatus: (message: string, userInitiated?: boolean) => void
  sendStatus: (status: UpdateStatus) => void
  scheduleAutomaticUpdateCheck: (delayMs: number) => void
  shouldSuppressMissingManifestPrereleaseFallbackEvent: (message: string, error: unknown) => boolean
  suppressMissingManifestPrereleaseFallbackPromiseFailure: (message: string) => void
  setAvailableReleaseUrl: (releaseUrl: string | null) => void
  setAvailableVersion: (version: string | null) => void
  setUserInitiatedCheck: (value: boolean) => void
}

export function registerAutoUpdaterHandlers(context: UpdaterHandlerContext): void {
  const {
    autoUpdater,
    clearBackgroundCheckLaunchPending,
    clearAvailableUpdateContext,
    consumeMissingManifestPrereleaseFallbackResult,
    getPublishingWindowLastGoodCheck,
    getMissingManifestPrereleaseFallbackUserInitiated,
    getCurrentStatus,
    getActiveUpdateCheckEventAttemptId,
    getKnownReleaseUrl,
    getPendingInstallVersion,
    getUserInitiatedCheck,
    handleQuitAndInstallFailure,
    isQuitAndInstallHandoffActive,
    hasInstallableDownloadedVersion,
    isLocalBuildCheck,
    isPinnedBuildCheck,
    shouldHandleUpdaterErrorEvent,
    markUpdateCheckEventAttempt,
    markMissingManifestPrereleaseFallbackChecking,
    performQuitAndInstall,
    shouldDeferMacQuitForInstall,
    recordCompletedUpdateCheck,
    restoreReleaseUpdateSource,
    sendCheckFailureStatus,
    sendErrorStatus,
    sendStatus,
    scheduleAutomaticUpdateCheck,
    shouldSuppressMissingManifestPrereleaseFallbackEvent,
    suppressMissingManifestPrereleaseFallbackPromiseFailure,
    setUserInitiatedCheck
  } = context
  // Why: electron-updater fires 'update-downloaded' before Squirrel.Mac finishes; track readiness to avoid a premature "ready".
  if (process.platform === 'darwin') {
    nativeUpdater.on('update-downloaded', () => {
      const hasInstallableVersion = hasInstallableDownloadedVersion()
      handleMacInstallerReady(hasInstallableVersion, performQuitAndInstall, () => {
        // Send the held status only while its staged build is still installable.
        sendStatus({
          state: 'downloaded',
          version: getPendingInstallVersion(),
          releaseUrl: getKnownReleaseUrl()
        })
      })
    })
  }

  app.on('before-quit', (event) => {
    if (!shouldDeferMacQuitForInstall()) {
      return
    }
    if (consumeMacInstallGuardBypass()) {
      recordUpdaterLifecycle('macos_before_quit_guard_bypassed')
      return
    }
    if (isMacQuitAndInstallInFlight()) {
      return
    }

    // Why: quitting before Squirrel.Mac finishes staging leaves nothing to install; hold the quit until it's ready.
    if (
      deferMacQuitUntilInstallerReady(
        getCurrentStatus(),
        hasInstallableDownloadedVersion(),
        getPendingInstallVersion,
        sendStatus
      )
    ) {
      recordUpdaterLifecycle('macos_before_quit_deferred', {
        version: getPendingInstallVersion()
      })
      event.preventDefault()
    }
  })

  autoUpdater.on('checking-for-update', () => {
    if (!markUpdateCheckEventAttempt()) {
      return
    }
    clearBackgroundCheckLaunchPending()
    resetMacInstallState()
    clearAvailableUpdateContext()
    markMissingManifestPrereleaseFallbackChecking()
    const fallbackUserInitiated = getMissingManifestPrereleaseFallbackUserInitiated()
    const wasUserInitiated = fallbackUserInitiated ?? getUserInitiatedCheck()
    sendStatus({ state: 'checking', userInitiated: wasUserInitiated || undefined })
  })

  registerUpdateAvailableHandler(context)

  autoUpdater.on('update-not-available', () => {
    if (getActiveUpdateCheckEventAttemptId() === null) {
      return
    }
    clearBackgroundCheckLaunchPending()
    resetMacInstallState()
    clearTrackedLinuxPackageArtifact()
    const missingManifestFallback = consumeMissingManifestPrereleaseFallbackResult()
    const publishingWindowLastGoodCheck = getPublishingWindowLastGoodCheck()
    const wasUserInitiated = missingManifestFallback?.userInitiated ?? getUserInitiatedCheck()
    const localBuildCheck = isLocalBuildCheck()
    // Why: an unpinned outcome must hand the feed back, else the pin blocks every
    // later background check for the process lifetime.
    const pinnedBuildCheck = isPinnedBuildCheck()
    setUserInitiatedCheck(false)
    clearAvailableUpdateContext()
    if (!localBuildCheck && !pinnedBuildCheck) {
      if (missingManifestFallback || publishingWindowLastGoodCheck) {
        // Why: last-good not-available is a transient release-transition outcome; keep the short retry, don't suppress for 24h.
        scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
      } else {
        recordCompletedUpdateCheck()
        if (!wasUserInitiated) {
          scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
        }
      }
    }
    sendStatus({ state: 'not-available', userInitiated: wasUserInitiated || undefined })
    if (localBuildCheck || pinnedBuildCheck) {
      restoreReleaseUpdateSource()
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    clearBackgroundCheckLaunchPending()
    const version = getPendingInstallVersion()
    clearTrackedLinuxPackageArtifactForOtherVersion(version)
    sendStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      version
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    clearBackgroundCheckLaunchPending()
    // Release downloads remain newer-only; the local source was validated before checking, and a pinned jump is explicit.
    if (
      !isLocalBuildCheck() &&
      !isPinnedBuildCheck() &&
      compareVersions(info.version, app.getVersion()) <= 0
    ) {
      clearAvailableUpdateContext()
      clearTrackedLinuxPackageArtifact()
      sendStatus({ state: 'not-available' })
      return
    }
    // Why: retain the verified artifact now — the 'error' event after a failed install no longer carries it.
    captureLinuxPackageArtifact(info)
    const macInstallerReady = process.platform === 'darwin' ? isMacInstallerReady() : true
    recordUpdaterLifecycle('update_downloaded', { version: info.version, macInstallerReady })
    // On macOS, defer 'downloaded' until Squirrel.Mac finishes processing; other platforms are ready immediately.
    if (process.platform === 'darwin' && !macInstallerReady) {
      // Keep the UI at 100% downloaded while Squirrel processes, to avoid a premature "ready to install".
      recordUpdaterLifecycle('macos_waiting_for_squirrel', { version: info.version })
      sendStatus({ state: 'downloading', percent: 100, version: info.version })
      return
    }
    sendStatus({ state: 'downloaded', version: info.version, releaseUrl: getKnownReleaseUrl() })
  })

  autoUpdater.on('error', (err) => {
    const message = err?.message ?? 'Unknown error'
    // Why: quitAndInstall reports "no staged update" via this error event (async on macOS); recover quit flags before suppression guards run.
    if (handleQuitAndInstallFailure(err)) {
      return
    }
    // Why: handoff still owns the process; don't treat as a check/download error.
    if (isQuitAndInstallHandoffActive()) {
      return
    }
    // Why: fallback promise handlers may already own this failure; don't consume fallback context here.
    if (shouldSuppressMissingManifestPrereleaseFallbackEvent(message, err)) {
      return
    }
    if (!shouldHandleUpdaterErrorEvent()) {
      return
    }
    clearBackgroundCheckLaunchPending()
    resetMacInstallState()
    suppressMissingManifestPrereleaseFallbackPromiseFailure(message)
    const missingManifestFallback = consumeMissingManifestPrereleaseFallbackResult()
    const wasUserInitiated = missingManifestFallback?.userInitiated ?? getUserInitiatedCheck()
    setUserInitiatedCheck(false)
    if (getCurrentStatus().state === 'checking') {
      void sendCheckFailureStatus(message, wasUserInitiated || undefined, 'event', err)
      return
    }
    sendErrorStatus(message, wasUserInitiated || undefined)
    if (isLocalBuildCheck() || isPinnedBuildCheck()) {
      restoreReleaseUpdateSource()
    }
  })
}
