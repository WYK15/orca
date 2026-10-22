import { join } from 'node:path'
import type { Store } from '../main/persistence'
import type { OrcaRuntimeService } from '../main/runtime/orca-runtime'
import { registerOrcaProfileHandlers } from '../main/ipc/orca-profiles'
import { registerKeybindingHandlers } from '../main/ipc/keybindings'
import { registerAgentHookHandlers } from '../main/ipc/agent-hooks'
import { registerCrashReportingHandlers } from '../main/ipc/crash-reporting'
import { registerClaudeUsageHandlers } from '../main/ipc/claude-usage'
import { registerCodexUsageHandlers } from '../main/ipc/codex-usage'
import { registerOpenCodeUsageHandlers } from '../main/ipc/opencode-usage'
import { registerCodexAccountHandlers } from '../main/ipc/codex-accounts'
import { registerClaudeAccountHandlers } from '../main/ipc/claude-accounts'
import { registerRateLimitHandlers } from '../main/ipc/rate-limits'
import { KeybindingService } from '../main/keybindings/keybinding-service'
import { CrashReportStore } from '../main/crash-reporting/crash-report-store'
import { ClaudeUsageStore } from '../main/claude-usage/store'
import { CodexUsageStore } from '../main/codex-usage/store'
import { OpenCodeUsageStore } from '../main/opencode-usage/store'
import { CodexAccountService } from '../main/codex-accounts/service'
import { CodexRuntimeHomeService } from '../main/codex-accounts/runtime-home-service'
import { ClaudeAccountService } from '../main/claude-accounts/service'
import { ClaudeRuntimeAuthService } from '../main/claude-accounts/runtime-auth-service'
import { RateLimitService } from '../main/rate-limits/service'
import { desktopPath } from './desktop-context'
import { getPtyIdForPaneKey } from '../main/ipc/pty'
import { agentHookServer } from '../main/agent-hooks/server'
import { registerNotificationHandlers } from '../main/ipc/notifications'
import { nativeCall } from './desktop-context'
import type { NotificationAuthorizationStatus } from '../main/ipc/notification-authorization-status'

export function registerServiceHandlers(
  store: Store,
  runtime: OrcaRuntimeService
): { keybindings: KeybindingService; shutdown: () => Promise<void> } {
  const data = desktopPath('userData')
  const keys = new KeybindingService({ homePath: data })
  registerKeybindingHandlers(keys)
  registerNotificationHandlers(store, undefined, {
    readAuthorization: async () =>
      (await nativeCall('notification-authorization')) as NotificationAuthorizationStatus,
    openSystemSettings: () => {
      void nativeCall('notification-settings').catch(console.error)
    }
  })
  registerOrcaProfileHandlers(store)
  registerAgentHookHandlers(runtime, { getPtyIdForPaneKey })
  registerCrashReportingHandlers(new CrashReportStore(join(data, 'crash-reports.json')))

  const claudeUsage = new ClaudeUsageStore(store)
  const codexUsage = new CodexUsageStore(store)
  registerClaudeUsageHandlers(claudeUsage)
  registerCodexUsageHandlers(codexUsage)
  const openCodeUsage = new OpenCodeUsageStore(store)
  registerOpenCodeUsageHandlers(openCodeUsage)
  const rates = new RateLimitService()
  agentHookServer.setClaudeStatusLineListener((event) => rates.ingestLiveClaudeRateLimits(event))
  const codexHome = new CodexRuntimeHomeService(store)
  const codex = new CodexAccountService(store, rates, codexHome)
  const claudeAuth = new ClaudeRuntimeAuthService(store)
  const claude = new ClaudeAccountService(store, rates, claudeAuth)
  registerCodexAccountHandlers(codex, () => store.getSettings())
  registerClaudeAccountHandlers(claude)
  registerRateLimitHandlers(rates, codex)
  runtime.setAccountServices({ claudeAccounts: claude, codexAccounts: codex, rateLimits: rates })

  const shutdown = async () => {
    rates.stop()
    agentHookServer.setClaudeStatusLineListener(null)
    await Promise.all([claudeUsage.flush(), codexUsage.flush(), openCodeUsage.flush()])
  }
  return { keybindings: keys, shutdown }
}
