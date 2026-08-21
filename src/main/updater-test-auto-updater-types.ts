import type { Mock } from 'vitest'

/** Loose spy signature for calls the updater suites only assert on. */
export type UpdaterSpy = Mock<(...args: unknown[]) => unknown>

export type AutoUpdaterMock = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  autoRunAppAfterInstall: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  disableDifferentialDownload: boolean
  logger: { error: (message: unknown) => void } | undefined
  on: Mock<(event: string, handler: (...args: unknown[]) => void) => AutoUpdaterMock>
  checkForUpdates: UpdaterSpy
  downloadUpdate: UpdaterSpy
  quitAndInstall: UpdaterSpy
  setFeedURL: UpdaterSpy
  updateConfigPath: string | undefined
  emit: (event: string, ...args: unknown[]) => void
  reset: () => void
}
