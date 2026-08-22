import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/fork-desktop-packages.yml'

describe('fork desktop package workflow', () => {
  it('triggers release packaging only for fork-version tags', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))

    expect(workflow.on.push.tags).toEqual(['v*-wyk.*'])
    expect(workflow.on.workflow_dispatch).toBeTruthy()
  })

  it('builds every desktop platform architecture from a requested ref', () => {
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
      'macos'
    ])
    expect(entries.map(({ os }) => os)).toEqual([
      'windows-2022',
      'ubuntu-24.04',
      'ubuntu-24.04-arm',
      'macos-15-intel'
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

  it('builds both macOS architectures in the configured target set', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const windows = workflow.jobs.package.strategy.matrix.include.find(
      ({ platform }) => platform === 'windows-x64'
    )
    const linuxX64 = workflow.jobs.package.strategy.matrix.include.find(
      ({ platform }) => platform === 'linux-x64'
    )
    const linuxArm64 = workflow.jobs.package.strategy.matrix.include.find(
      ({ platform }) => platform === 'linux-arm64'
    )
    const macos = workflow.jobs.package.strategy.matrix.include.find(
      ({ platform }) => platform === 'macos'
    )

    expect(windows.artifact_paths).toContain('dist/orcaw-windows-setup.exe')
    expect(windows.artifact_paths).toContain('dist/orcaw-windows-setup.exe.blockmap')
    expect(windows.artifact_paths).toContain('dist/latest.yml')
    expect(linuxX64.artifact_paths).not.toContain('dist/*.AppImage.blockmap')
    expect(linuxX64.artifact_paths).toContain('dist/latest-linux.yml')
    expect(linuxX64.package_command).toContain('ORCA_RELEASE_AUTO_UPDATE=1')
    expect(linuxArm64.artifact_paths).not.toContain('dist/*.AppImage.blockmap')
    expect(linuxArm64.artifact_paths).toContain('dist/latest-linux-arm64.yml')
    expect(linuxArm64.package_command).toContain('ORCA_RELEASE_AUTO_UPDATE=1')
    expect(windows.package_command).not.toContain('ORCA_RELEASE_AUTO_UPDATE=1')
    expect(macos.package_command).toContain('--mac --publish never')
    expect(macos.package_command).toContain('node config/scripts/verify-macos-release-env.mjs')
    expect(macos.package_command).toContain('ORCA_MAC_RELEASE=1')
    expect(macos.package_command).not.toContain('ORCA_RELEASE_AUTO_UPDATE=1')
    expect(macos.package_command).not.toMatch(/--(?:x64|arm64)/)
    expect(macos.artifact_paths).toContain('dist/orcaw-macos-*.dmg')
    expect(macos.artifact_paths).toContain('dist/orcaw-macos-*.dmg.blockmap')
    expect(macos.artifact_paths).toContain('dist/Orcaw-*-mac.zip')
    expect(macos.artifact_paths).toContain('dist/Orcaw-*-mac.zip.blockmap')
    expect(macos.artifact_paths).toContain('dist/latest-mac.yml')
  })

  it('publishes complete tag builds through one least-privilege release job', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const release = workflow.jobs.release
    const checkout = release.steps.find((step) => step.name === 'Checkout release verifier')
    const download = release.steps.find((step) => step.name === 'Download desktop packages')
    const create = release.steps.find((step) => step.name === 'Create or reuse draft release')
    const upload = release.steps.find((step) => step.name === 'Upload release assets')
    const verify = release.steps.find((step) => step.name === 'Verify Orcaw release assets')
    const publish = release.steps.find((step) => step.name === 'Publish release')

    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(release.needs).toBe('package')
    expect(release.if).toContain("github.event_name == 'push'")
    expect(release.if).toContain("startsWith(github.ref, 'refs/tags/v')")
    expect(release.permissions).toEqual({ contents: 'write' })
    expect(checkout.uses).toBe('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803')
    expect(checkout.with['persist-credentials']).toBe(false)
    expect(download.uses).toBe('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c')
    expect(download.with.pattern).toBe('orcaw-*-${{ github.run_number }}-*')
    expect(download.with['merge-multiple']).toBe(true)
    expect(create.run).toContain('release create "$TAG_NAME"')
    expect(create.run).toContain('--draft')
    expect(create.run).toContain('--generate-notes')
    expect(create.run).toContain('node config/scripts/release-publication-kind.mjs "$TAG_NAME"')
    expect(create.run).toContain('[[ "$publication_kind" == "prerelease" ]]')
    expect(create.run).toContain('--prerelease')
    expect(upload.run).toContain('gh release upload "$TAG_NAME"')
    expect(upload.run).toContain('--clobber')
    expect(verify.run).toContain(
      'node config/scripts/verify-release-required-assets.mjs "$TAG_NAME"'
    )
    expect(publish.run).toContain('gh release edit "$TAG_NAME"')
    expect(publish.run).toContain('--draft=false')
  })

  it('validates the selected upstream base and fork tag before packaging', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const validation = workflow.jobs.package.steps.find(
      (step) => step.name === 'Validate fork release contract'
    )

    expect(validation.if).toBe("github.event_name == 'push'")
    expect(validation.run).toContain('git fetch origin refs/heads/upstream-sync')
    expect(validation.run).toContain('git merge-base --is-ancestor origin/upstream-sync HEAD')
    expect(validation.run).toContain('config/scripts/fork-release-contract.mjs --release')
    expect(validation.run).toContain('"$GITHUB_REF_NAME"')
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
    expect(upload.uses).toBe('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a')
    expect(upload.with.name).toBe(
      'orcaw-${{ matrix.platform }}-${{ github.run_number }}-${{ steps.source.outputs.short_sha }}'
    )
    expect(upload.with.path).toBe('${{ matrix.artifact_paths }}')
    expect(upload.with['if-no-files-found']).toBe('error')
  })
})
