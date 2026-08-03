import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/fork-desktop-packages.yml'

describe('fork desktop package workflow', () => {
  it('builds five platform architectures from a requested ref', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const entries = workflow.jobs.package.strategy.matrix.include
    const checkout = workflow.jobs.package.steps.find(
      (step) => step.name === 'Checkout requested ref'
    )

    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.workflow_dispatch.inputs.ref.required).toBe(false)
    expect(checkout.with.ref).toBe('${{ inputs.ref || github.ref }}')
    expect(entries.map(({ platform }) => platform)).toEqual([
      'windows-x64',
      'linux-x64',
      'linux-arm64',
      'macos-x64',
      'macos-arm64'
    ])
    expect(entries.map(({ os }) => os)).toEqual([
      'windows-2022',
      'ubuntu-24.04',
      'ubuntu-24.04-arm',
      'macos-15-intel',
      'macos-15'
    ])
  })

  it('keeps every Electron Builder invocation local', () => {
    const source = readFileSync(workflowPath, 'utf8')
    const workflow = parse(source)
    const entries = workflow.jobs.package.strategy.matrix.include

    for (const entry of entries) {
      expect(entry.package_command).toContain('--publish never')
      expect(entry.artifact_paths).toBeTruthy()
    }
    expect(source).not.toContain('--publish always')
    expect(source).not.toContain('ORCA_BUILD_IDENTITY')
    expect(source).not.toContain('ORCA_POSTHOG_WRITE_KEY')
    expect(source).not.toContain('MAC_CERTS')
    expect(source).not.toContain('SIGNPATH')
  })

  it('fails when a platform produces no uploadable package', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const source = workflow.jobs.package.steps.find(
      (step) => step.name === 'Identify checked-out source'
    )
    const upload = workflow.jobs.package.steps.find(
      (step) => step.name === 'Upload desktop packages'
    )

    expect(source.shell).toBe('bash')
    expect(source.run).toContain('git rev-parse --short=12 HEAD')
    expect(upload.uses).toBe('actions/upload-artifact@v7')
    expect(upload.with.name).toBe(
      'orca-${{ matrix.platform }}-${{ github.run_number }}-${{ steps.source.outputs.short_sha }}'
    )
    expect(upload.with.path).toBe('${{ matrix.artifact_paths }}')
    expect(upload.with['if-no-files-found']).toBe('error')
  })
})
