import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { validateTauriReleaseSource } from './tauri-release-source.mjs'

const tag = process.env.RELEASE_TAG
const metadata = JSON.parse(readFileSync('package.json', 'utf8'))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const commit = git('rev-parse', 'HEAD')
validateTauriReleaseSource({
  tag,
  version: metadata.version,
  tauriVersion: JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version,
  commit,
  tagCommit: git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
})
const repository = process.env.GITHUB_REPOSITORY
if (!repository) {
  throw new Error('GITHUB_REPOSITORY is required.')
}
const directory = 'out/tauri-artifacts'
const stem = `Orcaw-Tauri-${metadata.version}-macos-arm64`
const files = [`${stem}.zip`, `${stem}.dmg`]
const expected = [...files, 'SHA256SUMS.txt'].sort()
if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(expected)) {
  throw new Error('The complete Mac ARM64 release asset set is required.')
}
const checksums = readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')
const computed = files.map(
  (name) =>
    `${createHash('sha256')
      .update(readFileSync(join(directory, name)))
      .digest('hex')}  ${name}`
)
if (JSON.stringify(checksums) !== JSON.stringify(computed)) {
  throw new Error('Release asset checksum mismatch.')
}
const gh = (...args) => execFileSync('gh', [...args, '--repo', repository], { encoding: 'utf8' })
let release
try {
  release = JSON.parse(gh('release', 'view', tag, '--json', 'isDraft,isPrerelease'))
} catch (error) {
  if (!/release not found|HTTP 404/i.test(String(error.stderr))) {
    throw error
  }
}
if (release && (!release.isDraft || !release.isPrerelease)) {
  throw new Error('Refusing to overwrite an existing published release or a non-prerelease draft.')
}
if (!release) {
  gh(
    'release',
    'create',
    tag,
    '--verify-tag',
    '--draft',
    '--prerelease',
    '--latest=false',
    '--title',
    `Orcaw Tauri ${metadata.version} (Mac ARM64 Preview)`,
    '--notes-file',
    'src-tauri/RELEASE_NOTES.md'
  )
}
gh('release', 'upload', tag, ...expected.map((name) => join(directory, name)), '--clobber')
const uploaded = JSON.parse(gh('release', 'view', tag, '--json', 'assets,isDraft'))
if (
  !uploaded.isDraft ||
  JSON.stringify(uploaded.assets.map((asset) => asset.name).sort()) !== JSON.stringify(expected)
) {
  throw new Error('The uploaded draft release is incomplete.')
}
gh('release', 'edit', tag, '--draft=false', '--prerelease', '--latest=false')
console.log(gh('release', 'view', tag, '--json', 'url', '--jq', '.url').trim())
