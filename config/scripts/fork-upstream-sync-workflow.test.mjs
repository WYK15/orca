import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/fork-upstream-sync.yml'

function loadWorkflow() {
  return parse(readFileSync(workflowPath, 'utf8'))
}

function workflowRunText() {
  return loadWorkflow()
    .jobs.sync.steps.map((step) => step.run ?? '')
    .join('\n')
}

describe('fork upstream sync workflow', () => {
  it('is manual and requires an upstream stable tag', () => {
    const workflow = loadWorkflow()

    expect(workflow.on.schedule).toBeUndefined()
    expect(workflow.on.workflow_dispatch.inputs.upstream_tag.required).toBe(true)
    expect(workflow.on.workflow_dispatch.inputs.allow_non_fast_forward).toMatchObject({
      required: false,
      default: false,
      type: 'boolean'
    })
  })

  it('fetches the explicit tag and only updates upstream-sync', () => {
    const runText = workflowRunText()

    expect(runText).toContain('refs/tags/$UPSTREAM_TAG:refs/tags/$UPSTREAM_TAG')
    expect(runText).toContain('refs/heads/upstream-sync')
    expect(runText).not.toContain('refs/heads/main')
    const pushCommands = runText.match(/git push[^\n]*(?:\n\s+--[^\n]*)?/g) ?? []
    expect(pushCommands.join('\n')).not.toMatch(/--force(?!-with-lease)/)
  })

  it('rejects non-fast-forward updates unless explicitly authorized', () => {
    const runText = workflowRunText()

    expect(runText).toContain('config/scripts/fork-release-contract.mjs')
    expect(runText).toContain('git merge-base --is-ancestor')
    expect(runText).toContain('ALLOW_NON_FAST_FORWARD')
    expect(runText).toContain('archive/upstream-sync-before-$UPSTREAM_TAG')
    expect(runText).toContain('--force-with-lease=refs/heads/upstream-sync:$CURRENT_UPSTREAM_SYNC')
    expect(runText).toContain('git diff --quiet')
  })

  it('pins checkout without persisting its credential', () => {
    const workflow = loadWorkflow()

    expect(workflow.permissions).toEqual({ contents: 'write' })
    expect(workflow.jobs.sync.steps[0]).toMatchObject({
      uses: 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
      with: { 'fetch-depth': 0, 'persist-credentials': false }
    })
    expect(workflow.jobs.sync.env.GH_TOKEN).toBe('${{ github.token }}')
    expect(workflowRunText()).toContain('gh auth setup-git')
  })
})
