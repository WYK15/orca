# Agent Hook Config Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent omitted agent detection and hook removal from creating configuration state for agents that are not installed.

**Architecture:** Remote aggregate installers require an explicit non-empty allowlist and return before any host probe when it is missing. Local removers inspect the original JSON snapshot and return without writing when the config did not exist, while retaining their current managed-entry cleanup for existing files.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest, pnpm, oxlint, oxfmt

## Global Constraints

- Work only in the primary `custom/main` working directory; do not create a worktree.
- Keep behavior portable across macOS, Linux, Windows, WSL, and SSH.
- Do not assume the workspace is a Git worktree; folder workspaces remain supported.
- Do not add `max-lines` disables or per-file line-limit bumps.
- Do not modify UI code or introduce design tokens.
- Preserve user configuration and remove only Orca-managed hook entries.
- Do not modify or stage the existing untracked `tests/test.md`.
- Keep the upstream PR #11676 portion separable from the local remover fix.
- Do not add `FORK_NOTES.md`; this is a routine safety fix.

## File Map

- `src/main/agent-hooks/remote-managed-hook-installers.ts`: enforce the remote allowlist at the final mutation boundary.
- `src/main/agent-hooks/managed-hook-runtime.ts`: return before home, shell, identity, and lock work when no agent is selected.
- `src/main/agent-hooks/managed-hook-runtime.test.ts`: prove an empty selection reaches none of those runtime boundaries.
- `src/main/agent-hooks/remote-hook-service-installers.test.ts`: prove missing and empty allowlists create no remote state.
- `src/main/agent-hooks/managed-hook-local-filesystem.test.ts`: make intentional aggregate installs explicit.
- `src/main/agent-hooks/wsl-hook-relay-manager.test.ts`: make the WSL aggregate fixture explicit.
- `src/main/cursor/hook-service.ts`: no-op removal for a missing Cursor config.
- `src/main/droid/hook-service.ts`: no-op removal for a missing Factory config.
- `src/main/antigravity/hook-service.ts`: no-op removal for a missing Antigravity config.
- `src/main/grok/hook-service.ts`: no-op removal for a missing Grok config.
- `src/main/command-code/hook-service.ts`: no-op removal for a missing Command Code config.
- `src/main/gemini/hook-service.ts`: no-op removal for a missing Gemini config.
- Corresponding `hook-service.test.ts` files: regression coverage that neither config files nor parent directories appear.

---

### Task 1: Fail Closed in Remote Aggregate Installation

**Files:**

- Modify: `src/main/agent-hooks/remote-managed-hook-installers.ts`
- Modify: `src/main/agent-hooks/managed-hook-runtime.ts`
- Create: `src/main/agent-hooks/managed-hook-runtime.test.ts`
- Test: `src/main/agent-hooks/remote-hook-service-installers.test.ts`
- Test: `src/main/agent-hooks/managed-hook-local-filesystem.test.ts`
- Test: `src/main/agent-hooks/wsl-hook-relay-manager.test.ts`

**Interfaces:**

- Consumes: `RemoteManagedHookInstallOptions.agents?: readonly AgentHookTarget[]`
- Produces: `installRemoteManagedAgentHooks(...)` returns `[]` when `agents` is omitted or empty.
- Produces: `installManagedHooks(...)` returns `{ installers: 0, errors: 0 }` before probing when `agents` is omitted or empty.

- [ ] **Step 1: Add the remote mutation-boundary regression test**

In `remote-hook-service-installers.test.ts`, add a test using `createFakeSftp()`:

```ts
it('fails closed when the agent allowlist is omitted or empty (issue #11641)', async () => {
  const { sftp, fs } = createFakeSftp()

  await expect(installRemoteManagedAgentHooks(sftp, '/home/dev')).resolves.toEqual([])
  await expect(
    installRemoteManagedAgentHooks(sftp, '/home/dev', { agents: [] })
  ).resolves.toEqual([])

  expect([...fs.files.keys()]).toEqual([])
  expect([...fs.dirs]).toEqual(['/'])
})
```

Import `REMOTE_MANAGED_HOOK_INSTALLER_AGENTS` beside `installRemoteManagedAgentHooks`. Pass `{ agents: REMOTE_MANAGED_HOOK_INSTALLER_AGENTS }` in existing tests that intentionally exercise every remote installer, including the aggregate Droid/Copilot test and cancellation test.

- [ ] **Step 2: Add the runtime early-return regression test**

Create `managed-hook-runtime.test.ts` with hoisted mocks for `node:os.homedir`, `installRemoteManagedAgentHooks`, `readManagedHookHostIdentity`, `scopeManagedHookHostIdentity`, and `withManagedHookInstallLock`. Preserve the other real `node:os` exports:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  homedir: vi.fn(),
  installRemote: vi.fn(),
  readHostIdentity: vi.fn(),
  scopeHostIdentity: vi.fn(),
  withInstallLock: vi.fn()
}))

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: mocks.homedir
}))
vi.mock('./remote-managed-hook-installers', () => ({
  installRemoteManagedAgentHooks: mocks.installRemote
}))
vi.mock('./managed-hook-owner-identity', () => ({
  readManagedHookHostIdentity: mocks.readHostIdentity,
  scopeManagedHookHostIdentity: mocks.scopeHostIdentity
}))
vi.mock('./managed-hook-install-lock', () => ({
  withManagedHookInstallLock: mocks.withInstallLock
}))

import { installManagedHooks } from './managed-hook-runtime'

describe('managed hook runtime', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns before host probes when no agents are detected', async () => {
    await expect(installManagedHooks({ agents: [] })).resolves.toEqual({
      installers: 0,
      errors: 0
    })

    expect(mocks.homedir).not.toHaveBeenCalled()
    expect(mocks.readHostIdentity).not.toHaveBeenCalled()
    expect(mocks.scopeHostIdentity).not.toHaveBeenCalled()
    expect(mocks.withInstallLock).not.toHaveBeenCalled()
    expect(mocks.installRemote).not.toHaveBeenCalled()
  })
})
```

This also proves the Grok login-shell probe cannot run because it requires the home value obtained after `homedir()`.

The core assertion is:

```ts
await expect(installManagedHooks({ agents: [] })).resolves.toEqual({
  installers: 0,
  errors: 0
})
```

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/agent-hooks/remote-hook-service-installers.test.ts \
  src/main/agent-hooks/managed-hook-runtime.test.ts
```

Expected: the missing allowlist installs agents, or runtime probe assertions fail because work occurs before the empty selection returns.

- [ ] **Step 4: Implement the final-boundary fail-closed guard**

In `installRemoteManagedAgentHooks`, replace the nullable allowlist with:

```ts
const allowedAgents = new Set(options?.agents ?? [])
if (allowedAgents.size === 0) {
  return []
}
```

Filter every installer with `!allowedAgents.has(agent)`. Update the option comment to state that omitted and empty lists install nothing.

- [ ] **Step 5: Implement the runtime early return**

At the start of `installManagedHooks`, after the abort check:

```ts
const agents = options?.agents ?? []
if (agents.length === 0) {
  return { installers: 0, errors: 0 }
}
```

Pass `agents` to `installRemoteManagedAgentHooks`. Do not resolve the home, probe `GROK_HOME`, read host identity, or acquire the install lock before this guard.

- [ ] **Step 6: Update explicit full-install fixtures**

In `managed-hook-local-filesystem.test.ts` and `wsl-hook-relay-manager.test.ts`, import `REMOTE_MANAGED_HOOK_INSTALLER_AGENTS` and pass it in tests whose purpose is to exercise all registered installers:

```ts
const options = {
  grokHomeDir: join(home, '.grok'),
  agents: REMOTE_MANAGED_HOOK_INSTALLER_AGENTS
}
```

- [ ] **Step 7: Verify GREEN**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/agent-hooks/remote-hook-service-installers.test.ts \
  src/main/agent-hooks/managed-hook-runtime.test.ts \
  src/main/agent-hooks/managed-hook-local-filesystem.test.ts \
  src/main/agent-hooks/wsl-hook-relay-manager.test.ts \
  src/relay/managed-hook-installer.test.ts
```

Expected: all selected tests pass with no unexpected warnings.

- [ ] **Step 8: Commit the remote safeguard**

```bash
git add \
  src/main/agent-hooks/remote-managed-hook-installers.ts \
  src/main/agent-hooks/managed-hook-runtime.ts \
  src/main/agent-hooks/managed-hook-runtime.test.ts \
  src/main/agent-hooks/remote-hook-service-installers.test.ts \
  src/main/agent-hooks/managed-hook-local-filesystem.test.ts \
  src/main/agent-hooks/wsl-hook-relay-manager.test.ts
git commit -m "fix(agent-hooks): fail closed without detected agents"
```

### Task 2: Make Missing Local Config Removal a True No-op

**Files:**

- Modify and test: `src/main/cursor/hook-service.ts`, `src/main/cursor/hook-service.test.ts`
- Modify and test: `src/main/droid/hook-service.ts`, `src/main/droid/hook-service.test.ts`
- Modify and test: `src/main/antigravity/hook-service.ts`, `src/main/antigravity/hook-service.test.ts`
- Modify and test: `src/main/grok/hook-service.ts`, `src/main/grok/hook-service.test.ts`
- Modify and test: `src/main/command-code/hook-service.ts`, `src/main/command-code/hook-service.test.ts`
- Modify and test: `src/main/gemini/hook-service.ts`, `src/main/gemini/hook-service.test.ts`

**Interfaces:**

- Consumes: `readHooksJsonWithRaw(configPath): { raw: string | null; config: HooksConfig | null }`
- Produces: each affected service's existing `remove(): AgentHookInstallStatus` returns `not_installed` without a write when the original config is absent.

- [ ] **Step 1: Add missing-config regression tests**

For each affected service, import `existsSync` from `node:fs` and add a test using that suite's isolated mocked home. Use the service-specific directory:

```ts
it('does not create config state when removing missing managed hooks', () => {
  const configDirectory = join(homeDir, '.cursor')
  const configPath = join(configDirectory, 'hooks.json')

  expect(new CursorHookService().remove().state).toBe('not_installed')
  expect(existsSync(configPath)).toBe(false)
  expect(existsSync(configDirectory)).toBe(false)
})
```

Use these paths and classes for the other five tests:

```ts
join(homeDir, '.factory', 'settings.json') // DroidHookService
join(homeDir, '.gemini', 'config', 'hooks.json') // AntigravityHookService
join(homeDir, '.grok', 'hooks', 'orca-status.json') // GrokHookService
join(homeDir, '.commandcode', 'settings.json') // CommandCodeHookService
join(homeDir, '.gemini', 'settings.json') // GeminiHookService
```

For the Gemini suite, which shares a `beforeAll` home, create a second temporary home inside the test, point `homedirMock` to it, and restore the original mocked home in `finally`.

- [ ] **Step 2: Run remover tests and verify RED**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/cursor/hook-service.test.ts \
  src/main/droid/hook-service.test.ts \
  src/main/antigravity/hook-service.test.ts \
  src/main/grok/hook-service.test.ts \
  src/main/command-code/hook-service.test.ts \
  src/main/gemini/hook-service.test.ts
```

Expected: at least Cursor, Droid, Antigravity, Grok, Command Code, and Gemini assertions report that their config path or parent directory was created.

- [ ] **Step 3: Implement snapshot-aware removal**

In each affected service, import `readHooksJsonWithRaw` from `../agent-hooks/installer-utils`. At the start of `remove()`, replace the plain read with:

```ts
const snapshot = readHooksJsonWithRaw(configPath)
if (snapshot.raw === null) {
  return this.getStatus()
}
const config = snapshot.config
```

Keep the existing `if (!config)` parse-error branch and all service-specific managed-hook cleanup unchanged. Do not alter `writeHooksJson`, install behavior, script cleanup, or unrelated services.

- [ ] **Step 4: Verify GREEN and preservation behavior**

Run the six suites from Step 2. Confirm the new missing-config tests pass and existing install/reinstall/preservation tests remain green.

- [ ] **Step 5: Run aggregate reconciliation tests**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/agent-hooks/managed-agent-hook-controls.test.ts \
  src/main/ipc/settings.test.ts \
  src/main/runtime/orca-runtime.test.ts
```

Expected: disabled-agent, global-off, settings update, and startup reconciliation tests pass.

- [ ] **Step 6: Commit the local removal safeguard**

```bash
git add \
  src/main/cursor/hook-service.ts src/main/cursor/hook-service.test.ts \
  src/main/droid/hook-service.ts src/main/droid/hook-service.test.ts \
  src/main/antigravity/hook-service.ts src/main/antigravity/hook-service.test.ts \
  src/main/grok/hook-service.ts src/main/grok/hook-service.test.ts \
  src/main/command-code/hook-service.ts src/main/command-code/hook-service.test.ts \
  src/main/gemini/hook-service.ts src/main/gemini/hook-service.test.ts
git commit -m "fix(agent-hooks): keep missing configs absent on removal"
```

### Task 3: Verify the Complete Fix

**Files:**

- Verify only; no new production files.

**Interfaces:**

- Consumes: both safeguards from Tasks 1 and 2.
- Produces: evidence that the complete issue #11641 fix is ready on `custom/main`.

- [ ] **Step 1: Format only changed implementation and test files**

Run:

```bash
pnpm exec oxfmt --write \
  src/main/agent-hooks/remote-managed-hook-installers.ts \
  src/main/agent-hooks/managed-hook-runtime.ts \
  src/main/agent-hooks/managed-hook-runtime.test.ts \
  src/main/agent-hooks/remote-hook-service-installers.test.ts \
  src/main/agent-hooks/managed-hook-local-filesystem.test.ts \
  src/main/agent-hooks/wsl-hook-relay-manager.test.ts \
  src/main/cursor/hook-service.ts src/main/cursor/hook-service.test.ts \
  src/main/droid/hook-service.ts src/main/droid/hook-service.test.ts \
  src/main/antigravity/hook-service.ts src/main/antigravity/hook-service.test.ts \
  src/main/grok/hook-service.ts src/main/grok/hook-service.test.ts \
  src/main/command-code/hook-service.ts src/main/command-code/hook-service.test.ts \
  src/main/gemini/hook-service.ts src/main/gemini/hook-service.test.ts
```

Do not format the repository or `tests/test.md`.

- [ ] **Step 2: Run focused hook coverage**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/agent-hooks/remote-hook-service-installers.test.ts \
  src/main/agent-hooks/managed-hook-runtime.test.ts \
  src/main/agent-hooks/managed-hook-local-filesystem.test.ts \
  src/main/agent-hooks/wsl-hook-relay-manager.test.ts \
  src/main/agent-hooks/managed-agent-hook-controls.test.ts \
  src/relay/managed-hook-installer.test.ts \
  src/main/cursor/hook-service.test.ts \
  src/main/droid/hook-service.test.ts \
  src/main/antigravity/hook-service.test.ts \
  src/main/grok/hook-service.test.ts \
  src/main/command-code/hook-service.test.ts \
  src/main/gemini/hook-service.test.ts
```

- [ ] **Step 3: Run static checks**

Run:

```bash
pnpm run typecheck:node
pnpm exec oxlint \
  src/main/agent-hooks/remote-managed-hook-installers.ts \
  src/main/agent-hooks/managed-hook-runtime.ts \
  src/main/agent-hooks/managed-hook-runtime.test.ts \
  src/main/agent-hooks/remote-hook-service-installers.test.ts \
  src/main/agent-hooks/managed-hook-local-filesystem.test.ts \
  src/main/agent-hooks/wsl-hook-relay-manager.test.ts \
  src/relay/managed-hook-installer.test.ts \
  src/main/cursor/hook-service.ts src/main/cursor/hook-service.test.ts \
  src/main/droid/hook-service.ts src/main/droid/hook-service.test.ts \
  src/main/antigravity/hook-service.ts src/main/antigravity/hook-service.test.ts \
  src/main/grok/hook-service.ts src/main/grok/hook-service.test.ts \
  src/main/command-code/hook-service.ts src/main/command-code/hook-service.test.ts \
  src/main/gemini/hook-service.ts src/main/gemini/hook-service.test.ts
pnpm run check:max-lines-ratchet
```

- [ ] **Step 4: Inspect scope and history**

Run:

```bash
git diff --check origin/custom/main...HEAD
git status --short
git log --oneline origin/custom/main..HEAD
```

Confirm only the design, plan, remote safeguard, local remover safeguard, and their tests are committed. Confirm `tests/test.md` remains untracked and unchanged.
