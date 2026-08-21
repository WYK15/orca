import { app } from 'electron'
import { createAvailableReleaseStatus } from './updater-delivery-policy'
import { compareVersions } from './updater-fallback'
import { fetchChangelog } from './updater-changelog'
import { clearTrackedLinuxPackageArtifactForOtherVersion } from './linux-package-update-recovery'
import type { UpdaterHandlerContext } from './updater-events'

const AUTO_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const AUTO_UPDATE_RETRY_INTERVAL_MS = 60 * 60 * 1000

export function registerUpdateAvailableHandler(context: UpdaterHandlerContext): void {
  const {
    autoUpdater,
    clearAvailableUpdateContext,
    clearBackgroundCheckLaunchPending,
    clearUpdateAvailableEventPending,
    consumeMissingManifestPrereleaseFallbackResult,
    getActiveUpdateCheckEventAttemptId,
    getCurrentStatus,
    getPublishingWindowLastGoodCheck,
    getReleaseUpdateDelivery,
    getUserInitiatedCheck,
    isActiveUpdateCheckAttempt,
    isLocalBuildCheck,
    isPinnedBuildCheck,
    markUpdateAvailableEventPending,
    recordCompletedUpdateCheck,
    scheduleAutomaticUpdateCheck,
    sendStatus,
    setAvailableReleaseUrl,
    setAvailableVersion,
    setUserInitiatedCheck
  } = context

  autoUpdater.on('update-available', (info) => {
    const attemptId = getActiveUpdateCheckEventAttemptId()
    if (attemptId === null) {
      return
    }
    clearBackgroundCheckLaunchPending()
    const missingManifestFallback = consumeMissingManifestPrereleaseFallbackResult()
    const publishingWindowLastGoodCheck = getPublishingWindowLastGoodCheck()
    const wasUserInitiated = missingManifestFallback?.userInitiated ?? getUserInitiatedCheck()
    setUserInitiatedCheck(false)

    if (
      !isLocalBuildCheck() &&
      !isPinnedBuildCheck() &&
      compareVersions(info.version, app.getVersion()) <= 0
    ) {
      clearAvailableUpdateContext()
      if (missingManifestFallback || publishingWindowLastGoodCheck) {
        scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
      } else {
        recordCompletedUpdateCheck()
        if (!wasUserInitiated) {
          scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
        }
      }
      sendStatus({ state: 'not-available', userInitiated: wasUserInitiated || undefined })
      return
    }

    clearTrackedLinuxPackageArtifactForOtherVersion(info.version)
    markUpdateAvailableEventPending(attemptId)
    void (async () => {
      try {
        const changelog =
          isLocalBuildCheck() || isPinnedBuildCheck()
            ? null
            : await fetchChangelog(info.version, app.getVersion()).catch(() => null)
        if (!isActiveUpdateCheckAttempt(attemptId)) {
          return
        }
        if (getCurrentStatus().state !== 'checking' && getCurrentStatus().state !== 'idle') {
          return
        }

        setAvailableVersion(info.version)
        const availableUpdate = createAvailableReleaseStatus(
          info.version,
          changelog,
          isLocalBuildCheck() ? 'automatic' : getReleaseUpdateDelivery()
        )
        setAvailableReleaseUrl(availableUpdate.releaseUrl)
        if (!isLocalBuildCheck() && !isPinnedBuildCheck()) {
          if (missingManifestFallback || publishingWindowLastGoodCheck) {
            scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)
          } else {
            recordCompletedUpdateCheck()
            if (!wasUserInitiated) {
              scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
            }
          }
        }
        sendStatus(availableUpdate.status)
      } finally {
        clearUpdateAvailableEventPending(attemptId)
      }
    })()
  })
}
