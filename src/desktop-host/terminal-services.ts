import type { Store } from '../main/persistence'
import type { OrcaRuntimeService } from '../main/runtime/orca-runtime'
import { agentHookServer } from '../main/agent-hooks/server'
import { isAgentStatusHooksEnabled } from '../main/agent-hooks/managed-agent-hook-controls'
import { setMigrationUnsupportedPtyListener } from '../main/agent-hooks/migration-unsupported-pty-state'
import { disconnectDaemon, initDaemonPtyProvider } from '../main/daemon/daemon-init'
import { registerDaemonManagementHandlers } from '../main/ipc/pty-management'
import { enrichAgentStatusIpcPayload } from '../main/ipc/agent-status-ipc-boundary'
import { startFirstWindowStartupServices } from '../main/startup/first-window-startup-services'
import { desktopPath, sendDesktopEvent } from './desktop-context'

export function startTerminalServices(store: Store, runtime: OrcaRuntimeService) {
  agentHookServer.setListener(({ payload, isReplay: _isReplay, ...identity }) => {
    sendDesktopEvent(
      'agentStatus:set',
      enrichAgentStatusIpcPayload({ ...payload, ...identity }, runtime)
    )
  })
  agentHookServer.setPaneStatusClearListener((event) =>
    sendDesktopEvent('agentStatus:clear', event)
  )
  setMigrationUnsupportedPtyListener((event) => {
    if (event.type === 'set') {
      sendDesktopEvent('agentStatus:migrationUnsupported', event.entry)
    } else {
      sendDesktopEvent('agentStatus:migrationUnsupportedClear', { ptyId: event.ptyId })
    }
  })
  registerDaemonManagementHandlers()
  const startup = startFirstWindowStartupServices({
    startDaemonPtyProvider: (signal) =>
      initDaemonPtyProvider(signal, { macosLoginSessionWatch: process.platform === 'darwin' }),
    startAgentHookServer: async () => {
      if (isAgentStatusHooksEnabled(store.getSettings())) {
        await agentHookServer.start({ env: 'tauri', userDataPath: desktopPath('userData') })
      }
    },
    onDaemonError: (error) =>
      console.error('[desktop-host] Persistent terminals unavailable:', error),
    onAgentHookServerError: (error) =>
      console.error('[desktop-host] Agent hooks unavailable:', error)
  })
  return {
    ...startup,
    shutdown: async () => {
      await startup.localPtyReady
      agentHookServer.setListener(null)
      agentHookServer.setPaneStatusClearListener(null)
      setMigrationUnsupportedPtyListener(null)
      agentHookServer.stop()
      await disconnectDaemon()
    }
  }
}
