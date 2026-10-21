import { join } from 'node:path'
import type { BrowserWindow, WebContents } from 'electron'
import type { Store } from '../main/persistence'
import type { OrcaRuntimeService } from '../main/runtime/orca-runtime'
import { registerLinearHandlers } from '../main/ipc/linear'
import { registerJiraHandlers } from '../main/ipc/jira'
import { registerOrcaProfileHandlers } from '../main/ipc/orca-profiles'
import { registerKeybindingHandlers } from '../main/ipc/keybindings'
import { registerRemoteWorkspaceHandlers } from '../main/ipc/remote-workspace'
import { registerAgentHookHandlers } from '../main/ipc/agent-hooks'
import { registerCrashReportingHandlers } from '../main/ipc/crash-reporting'
import { registerPluginHandlers } from '../main/ipc/plugins'
import { registerAutomationHandlers } from '../main/ipc/automations'
import { registerClaudeUsageHandlers } from '../main/ipc/claude-usage'
import { registerCodexUsageHandlers } from '../main/ipc/codex-usage'
import { registerOpenCodeUsageHandlers } from '../main/ipc/opencode-usage'
import { registerCodexAccountHandlers } from '../main/ipc/codex-accounts'
import { registerClaudeAccountHandlers } from '../main/ipc/claude-accounts'
import { registerRateLimitHandlers } from '../main/ipc/rate-limits'
import { KeybindingService } from '../main/keybindings/keybinding-service'
import { CrashReportStore } from '../main/crash-reporting/crash-report-store'
import { PluginService } from '../main/plugins/plugin-service'
import { resolvePluginHostEntryPath } from '../main/plugins/plugin-host-process'
import {
  normalizePluginIdList,
  normalizePluginConsents
} from '../shared/plugins/plugin-consent-state'
import { AutomationService } from '../main/automations/service'
import { ClaudeUsageStore } from '../main/claude-usage/store'
import { CodexUsageStore } from '../main/codex-usage/store'
import { OpenCodeUsageStore } from '../main/opencode-usage/store'
import { CodexAccountService } from '../main/codex-accounts/service'
import { CodexRuntimeHomeService } from '../main/codex-accounts/runtime-home-service'
import { ClaudeAccountService } from '../main/claude-accounts/service'
import { ClaudeRuntimeAuthService } from '../main/claude-accounts/runtime-auth-service'
import { RateLimitService } from '../main/rate-limits/service'
import { desktopPath } from './desktop-context'
import { desktopWindow, renderer } from './ipc-port'
import { app } from './electron-port'
import { getPtyIdForPaneKey } from '../main/ipc/pty'
import { agentHookServer } from '../main/agent-hooks/server'
import metadata from '../../package.json'

export function registerServiceHandlers(
  store: Store,
  runtime: OrcaRuntimeService
): { keybindings: KeybindingService; shutdown: () => Promise<void> } {
  const data = desktopPath('userData')
  const keys = new KeybindingService({ homePath: data })
  registerKeybindingHandlers(keys)
  registerLinearHandlers()
  registerJiraHandlers()
  registerOrcaProfileHandlers(store)
  registerAgentHookHandlers(runtime, { getPtyIdForPaneKey })
  registerRemoteWorkspaceHandlers(store, () => desktopWindow as unknown as BrowserWindow)
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

  const automations = new AutomationService(store, { claudeUsage, codexUsage })
  automations.setWebContents(renderer as unknown as WebContents)
  runtime.setAutomationService(automations)
  registerAutomationHandlers(store, automations)
  automations.start()

  const plugins = new PluginService({
    userDataPath: data,
    hostEntryPath: resolvePluginHostEntryPath(app.getAppPath(), false),
    hostVersion: metadata.version,
    isPluginSystemEnabled: () => store.getSettings().pluginSystemEnabled === true,
    getDisabledPlugins: () => normalizePluginIdList(store.getSettings().disabledPlugins),
    getPluginConsents: () => normalizePluginConsents(store.getSettings().pluginConsents),
    getDevPluginPaths: () => normalizePluginIdList(store.getSettings().devPluginPaths),
    getKeybindings: () => keys.getOverrides()
  })
  registerPluginHandlers(store, plugins, runtime)
  plugins.onChanged((event) => renderer.send('plugins:changed', event))
  const unsubscribeAgentEvents = agentHookServer.subscribeEnrichedStatus((event) => {
    plugins.emitEvent('agent.status.changed', event)
  })
  void plugins.initialize().catch(console.error)
  const shutdown = async () => {
    automations.stop()
    rates.stop()
    agentHookServer.setClaudeStatusLineListener(null)
    unsubscribeAgentEvents()
    await Promise.all([
      claudeUsage.flush(),
      codexUsage.flush(),
      openCodeUsage.flush(),
      plugins.dispose()
    ])
  }
  return { keybindings: keys, shutdown }
}
