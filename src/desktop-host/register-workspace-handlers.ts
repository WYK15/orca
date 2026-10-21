import { registerRepoHandlers } from '../main/ipc/repos'
import { registerWorktreeHandlers } from '../main/ipc/worktrees'
import { registerFilesystemHandlers } from '../main/ipc/filesystem'
import { registerFilesystemWatcherHandlers } from '../main/ipc/filesystem-watcher'
import { registerSessionHandlers } from '../main/ipc/session'
import { registerSettingsHandlers } from '../main/ipc/settings'
import { registerUIHandlers, setTrustedUIRendererWebContentsId } from '../main/ipc/ui'
import { registerPreflightHandlers } from '../main/ipc/preflight'
import { registerRuntimeHandlers } from '../main/ipc/runtime'
import { registerRuntimeEnvironmentHandlers } from '../main/ipc/runtime-environments'
import { registerPtyHandlers, getLocalPtyProvider, getSshPtyProvider } from '../main/ipc/pty'
import { registerSshHandlers } from '../main/ipc/ssh'
import { registerShellHandlers } from '../main/ipc/shell'
import { registerOnboardingHandlers } from '../main/ipc/onboarding'
import { registerAiVaultHandlers } from '../main/ipc/ai-vault'
import { registerNativeChatHandlers } from '../main/ipc/native-chat'
import { registerSkillsHandlers } from '../main/ipc/skills'
import { registerGitHubHandlers } from '../main/ipc/github'
import { registerGitLabHandlers } from '../main/ipc/gitlab'
import { registerHostedReviewHandlers } from '../main/ipc/hosted-review'
import { registerStatsHandlers } from '../main/ipc/stats'
import { registerNotebookHandlers } from '../main/ipc/notebook'
import { registerUnavailableSpeechHandlers } from '../main/ipc/speech-unavailable-handlers'
import type { Store } from '../main/persistence'
import { StatsCollector } from '../main/stats/collector'
import { OrcaRuntimeService } from '../main/runtime/orca-runtime'
import type { BrowserWindow } from 'electron'
import { desktopWindow } from './ipc-port'
import { startTerminalServices } from './terminal-services'
import { getDaemonProvider } from '../main/daemon/daemon-init'
import { agentHookServer } from '../main/agent-hooks/server'
import { isAgentStatusHooksEnabled } from '../main/agent-hooks/managed-agent-hook-controls'
import { clearProviderPtyState } from '../main/ipc/pty'
import { loadAgentSessionClaimSigner } from '../main/runtime/agent-session-claim-identity'
import { desktopPath } from './desktop-context'

export function registerWorkspaceHandlers(store: Store): {
  runtime: OrcaRuntimeService
  firstWindowReady: Promise<void>
  shutdown: () => Promise<void>
} {
  const window = desktopWindow as unknown as BrowserWindow
  const stats = new StatsCollector()
  const runtime = new OrcaRuntimeService(store, stats, {
    getLocalProvider: getLocalPtyProvider,
    getSshProvider: getSshPtyProvider,
    agentSessionClaimSigner: loadAgentSessionClaimSigner(
      desktopPath('userData'),
      desktopPath('userData')
    ),
    onPtyStopped: clearProviderPtyState,
    onTerminalAgentStatus: (event) => agentHookServer.ingestTerminalStatus(event),
    onTerminalSideEffects: (batch) => window.webContents.send('pty:sideEffect', batch),
    getAgentStatusSnapshot: () =>
      agentHookServer.getStatusSnapshot().filter((entry) => entry.providerSessionOnly !== true),
    getAgentProviderSessionSnapshot: () => agentHookServer.getStatusSnapshot(),
    getAgentProviderSessionRowsForPane: (paneKey) =>
      agentHookServer.getStatusSnapshotForPane(paneKey),
    attestAgentHookCompatibilityAuthority: (candidate) =>
      agentHookServer.attestCompatibilityAuthority(candidate),
    retireAgentHookCompatibilityAuthority: (paneKey) =>
      agentHookServer.retirePaneAuthority(paneKey),
    buildAgentHookPtyEnv: () =>
      isAgentStatusHooksEnabled(store.getSettings()) ? agentHookServer.buildPtyEnv() : {},
    canRecoverPersistentLocalPtys: () => getDaemonProvider() !== null
  })
  const terminals = startTerminalServices(store, runtime)
  setTrustedUIRendererWebContentsId(1)
  registerRepoHandlers(window, store)
  registerWorktreeHandlers(window, store, runtime)
  registerPtyHandlers(window, runtime, undefined, () => store.getSettings(), undefined, store, {
    awaitLocalPtyStartup: () => terminals.localPtyReady,
    awaitLocalPtyProviderStartup: () => terminals.localPtyProviderReady
  })
  registerSshHandlers(store, () => window, runtime)
  registerFilesystemHandlers(store)
  registerFilesystemWatcherHandlers()
  registerSessionHandlers(store)
  registerSettingsHandlers(store)
  registerUIHandlers(store)
  registerPreflightHandlers()
  registerRuntimeHandlers(runtime)
  registerRuntimeEnvironmentHandlers(store)
  registerShellHandlers(store)
  registerOnboardingHandlers(store)
  registerAiVaultHandlers()
  registerNativeChatHandlers()
  registerSkillsHandlers(store)
  registerGitHubHandlers(store, stats)
  registerGitLabHandlers(store)
  registerHostedReviewHandlers(store, stats)
  registerStatsHandlers(stats)
  registerNotebookHandlers(store)
  registerUnavailableSpeechHandlers()
  return {
    runtime,
    firstWindowReady: terminals.firstWindowReady,
    shutdown: async () => {
      await terminals.shutdown()
      await stats.flushAsync()
    }
  }
}
