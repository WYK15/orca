# Codex AI Vault Session Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete a local native Codex session completely: verified transcript aliases and every applicable index record.

**Architecture:** Codex uses a dedicated deletion service rather than the generic single-file remover. IPC supplies the selected session identity; the main process verifies aliases by parsing them, atomically filters indexes before removing transcripts, and invalidates only affected caches.

**Tech Stack:** TypeScript, Node.js filesystem promises, Electron IPC, Vitest, Playwright, pnpm

## Global Constraints

- Work only in primary `custom/main`; no worktree.
- Support macOS, Linux, and native Windows paths with Node path utilities.
- Reject SSH, runtime-host, and WSL Codex deletion; no shell command may include a session path.
- Delete only scanner-root paths whose parsed session id matches the selected id.
- Rewrite indexes with a same-directory temporary file and rename.
- Keep `tests/test.md` untouched and unstaged.
- Do not add max-lines disables or threshold bumps.
- Keep Codex changes separate from generic agent deletion and do not add `FORK_NOTES.md`.

## File Map

- `src/shared/ai-vault-session-deletion.ts`: delete payload and Codex allowlist.
- `src/main/ai-vault/codex-session-delete.ts`: plan, index rewrite, alias removal.
- `src/main/ai-vault/codex-session-delete.test.ts`: filesystem safety regression coverage.
- `src/main/ai-vault/session-scanner-codex-title-index.ts`: per-home cache invalidation.
- `src/main/ipc/ai-vault-delete.ts`: Codex route and existing cache invalidation.
- `src/renderer/src/lib/ai-vault-session-path-actions.ts`: include session identity in delete payload.
- `tests/e2e/ai-vault-session-delete.spec.ts`: real local Codex deletion.

---

### Task 1: Build the Codex Deletion Service

**Files:**

- Modify: `src/shared/ai-vault-session-deletion.ts`
- Create: `src/main/ai-vault/codex-session-delete.ts`
- Create: `src/main/ai-vault/codex-session-delete.test.ts`
- Modify: `src/main/ai-vault/session-scanner-codex-title-index.ts`

**Interfaces:**

- Consumes: `AiVaultDeleteSessionArgs.sessionId?: string` and `codexHome?: string | null`.
- Produces: `deleteCodexAiVaultSession(args): Promise<AiVaultDeleteSessionResult>`.
- Produces: `invalidateCodexSessionIndexTitleCache(codexHomes: readonly string[]): void`.

- [ ] **Step 1: Write failing alias/index tests**

Seed a temporary default home, managed home, and custom home with a transcript containing:

```json
{"type":"session_meta","payload":{"id":"session-a","cwd":"/repo"}}
```

Each `session_index.jsonl` contains records for `session-a` and `session-b`. Assert a successful delete removes every verified `session-a` transcript and index line but preserves `session-b`. Cover a hardlink alias, independent copy, missing index, mismatched transcript id, outside-root path, synthetic path, non-local host, WSL UNC path, and injected index-write failure. The failure case must prove all transcripts remain.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/ai-vault/codex-session-delete.test.ts
```

Expected: fail because Codex has no dedicated executor and is rejected by the shared allowlist.

- [ ] **Step 3: Implement the plan and executor**

Define:

```ts
type CodexDeletionPlan = {
  sessionId: string
  transcriptPaths: readonly string[]
  indexPaths: readonly string[]
  codexHomes: readonly string[]
}
```

Derive and deduplicate configured/default/managed native homes. Discover only `.jsonl` entries under their `sessions` roots; parse them with the existing Codex parser; retain only the requested id. Precompute filtered index content, atomically rename every existing index first, then trash each unique filesystem identity. A rewrite or trash failure returns `failed` and does not invalidate caches. Treat missing aliases and missing indexes as idempotent success.

- [ ] **Step 4: Add contract and cache support**

Add `sessionId?: string` and `codexHome?: string | null` to the shared args, add Codex to `AI_VAULT_DELETABLE_AGENTS`, and add per-home title-cache invalidation. Generic non-Codex validation/execution remains unchanged.

- [ ] **Step 5: Run GREEN**

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/ai-vault/codex-session-delete.test.ts \
  src/main/ai-vault/session-scanner-codex-title-index.test.ts \
  src/main/ai-vault/session-scanner-codex-dual-root.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/ai-vault-session-deletion.ts src/main/ai-vault/codex-session-delete.ts src/main/ai-vault/codex-session-delete.test.ts src/main/ai-vault/session-scanner-codex-title-index.ts src/main/ai-vault/session-scanner-codex-title-index.test.ts
git commit -m "fix(ai-vault): delete complete Codex sessions"
```

### Task 2: Route Renderer and IPC Deletion

**Files:**

- Modify: `src/main/ipc/ai-vault-delete.ts`
- Modify: `src/main/ipc/ai-vault-delete.test.ts`
- Modify: `src/renderer/src/lib/ai-vault-session-path-actions.ts`
- Modify: `src/renderer/src/lib/ai-vault-session-path-actions.test.ts`
- Modify: `tests/e2e/ai-vault-session-delete.spec.ts`

**Interfaces:**

- Consumes: selected `AiVaultSession.sessionId` and `.codexHome`.
- Produces: one successful Codex delete invalidates local/multi-host/parse/title caches.

- [ ] **Step 1: Write failing route tests**

Use:

```ts
{ agent: 'codex', sessionId: 'session-a', filePath: '/home/ada/.codex/sessions/2026/08/05/rollout-a.jsonl', codexHome: null }
```

Assert renderer IPC includes `sessionId` and `codexHome`; assert main routes Codex to the dedicated service, not `deleteAiVaultSessionFile`; assert success invalidates the three existing session caches and the rewritten-home title cache.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/ipc/ai-vault-delete.test.ts src/renderer/src/lib/ai-vault-session-path-actions.test.ts
```

Expected: payload fields are absent and Codex follows the unsupported generic path.

- [ ] **Step 3: Implement narrow IPC wiring**

Forward identity fields from the selected row. Branch only on `args?.agent === 'codex'`; call the new service with configured additional homes; retain the generic delete path for all other agents. Invalidate all caches only for `{ outcome: 'deleted' }`.

- [ ] **Step 4: Add local E2E**

Seed an isolated-home Codex transcript and index, list it through real IPC, delete it through real IPC, and assert transcript/index line absence plus no forced-list result.

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/ipc/ai-vault-delete.test.ts src/renderer/src/lib/ai-vault-session-path-actions.test.ts tests/e2e/ai-vault-session-delete.spec.ts
git add src/main/ipc/ai-vault-delete.ts src/main/ipc/ai-vault-delete.test.ts src/renderer/src/lib/ai-vault-session-path-actions.ts src/renderer/src/lib/ai-vault-session-path-actions.test.ts tests/e2e/ai-vault-session-delete.spec.ts
git commit -m "fix(ai-vault): route Codex session deletion"
```

### Task 3: Verify the Complete Flow

**Files:** Verify only.

- [ ] **Step 1: Format changed files only**

```bash
pnpm exec oxfmt --write src/shared/ai-vault-session-deletion.ts src/main/ai-vault/codex-session-delete.ts src/main/ai-vault/codex-session-delete.test.ts src/main/ai-vault/session-scanner-codex-title-index.ts src/main/ipc/ai-vault-delete.ts src/main/ipc/ai-vault-delete.test.ts src/renderer/src/lib/ai-vault-session-path-actions.ts src/renderer/src/lib/ai-vault-session-path-actions.test.ts tests/e2e/ai-vault-session-delete.spec.ts
```

- [ ] **Step 2: Run focused verification**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/ai-vault/codex-session-delete.test.ts src/main/ai-vault/session-delete.test.ts src/main/ai-vault/session-scanner-codex-title-index.test.ts src/main/ai-vault/session-scanner-codex-dual-root.test.ts src/main/ipc/ai-vault-delete.test.ts src/renderer/src/lib/ai-vault-session-path-actions.test.ts tests/e2e/ai-vault-session-delete.spec.ts
pnpm run typecheck:node
pnpm run check:max-lines-ratchet
git diff --check origin/custom/main...HEAD
```

- [ ] **Step 3: Verify final scope**

```bash
git status --short
git log --oneline origin/custom/main..HEAD
```

Confirm `tests/test.md` remains untracked and only the design, plan, Codex-specific service, IPC/renderer wiring, and tests are committed.
