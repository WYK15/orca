import { renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { openFileExplorer } from './helpers/file-explorer'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('refreshes the visible tree after external Windows file changes', async ({ orcaPage }) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await orcaPage.evaluate(() => window.__store?.getState().setRightSidebarOpen(false))
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().rightSidebarOpen))
    .toBe(false)
  await openFileExplorer(orcaPage)

  const worktreePath = await orcaPage.evaluate(() => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    if (!state || !worktreeId) {
      throw new Error('active worktree unavailable')
    }
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((candidate) => candidate.id === worktreeId)
    if (!worktree) {
      throw new Error('active worktree path unavailable')
    }
    return worktree.path
  })

  const originalName = 'watch-refresh-case.txt'
  const renamedName = 'WATCH-REFRESH-CASE.txt'
  const originalPath = path.join(worktreePath, originalName)
  const renamedPath = path.join(worktreePath, renamedName)
  const row = (name: string) =>
    orcaPage
      .locator('[data-file-explorer-row]')
      .filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })

  rmSync(originalPath, { force: true })
  rmSync(renamedPath, { force: true })
  try {
    await expect(row('README.md')).toBeVisible({ timeout: 10_000 })
    await orcaPage.waitForTimeout(2_000)

    writeFileSync(originalPath, 'created outside Orca\n')
    await expect(row(originalName)).toBeVisible({ timeout: 10_000 })

    renameSync(originalPath, renamedPath)
    await expect(row(renamedName)).toBeVisible({ timeout: 10_000 })
    await expect(row(originalName)).toHaveCount(0, { timeout: 10_000 })

    rmSync(renamedPath)
    await expect(row(renamedName)).toHaveCount(0, { timeout: 10_000 })
  } finally {
    rmSync(originalPath, { force: true })
    rmSync(renamedPath, { force: true })
  }
})

test('refreshes cached files after external changes while Explorer was hidden', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await openFileExplorer(orcaPage)
  const rows = orcaPage.locator('[data-file-explorer-row]')
  await expect(rows.filter({ hasText: 'README.md' })).toBeVisible()
  const root = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const worktree = state.getKnownWorktreeById(state.activeWorktreeId!)
    if (!worktree) {
      throw new Error('active worktree unavailable')
    }
    return worktree.path
  })
  const file = path.join(root, 'created-while-hidden.txt')
  try {
    await orcaPage.evaluate(() => window.__store!.getState().setRightSidebarOpen(false))
    await expect(rows.filter({ hasText: 'README.md' })).not.toBeVisible()
    writeFileSync(file, 'external change while hidden\n')
    await openFileExplorer(orcaPage)
    await expect(rows.filter({ hasText: 'created-while-hidden.txt' })).toBeVisible()
    rmSync(file)
    await expect(rows.filter({ hasText: 'created-while-hidden.txt' })).toHaveCount(0)
  } finally {
    rmSync(file, { force: true })
  }
})
