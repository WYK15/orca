import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowDirectory = '.github/workflows'

describe('fork workflow trigger policy', () => {
  it('does not run inherited maintenance workflows on a schedule', () => {
    const scheduledWorkflows = readdirSync(workflowDirectory)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .filter((name) => {
        const workflow = parse(readFileSync(path.join(workflowDirectory, name), 'utf8'))
        return workflow.on?.schedule !== undefined
      })

    expect(scheduledWorkflows).toEqual([])
  })
})
