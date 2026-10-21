import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function validateTauriReleaseSource({ tag, version, tauriVersion, commit, tagCommit }) {
  if (!/^v\d+\.\d+\.\d+-wyk\.\d+-tauri\.\d+$/.test(tag ?? '')) {
    throw new Error('A release requires an existing vX.Y.Z-wyk.N-tauri.N tag.')
  }
  if (tag !== `v${version}` || version !== tauriVersion) {
    throw new Error('The tag, package version and Tauri version must match.')
  }
  if (!commit || commit !== tagCommit) {
    throw new Error('The checked-out commit must match the release tag.')
  }
  return tag
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const tag = process.env.RELEASE_TAG
  if (!/^v\d+\.\d+\.\d+-wyk\.\d+-tauri\.\d+$/.test(tag ?? '')) {
    throw new Error('A Tauri release tag must be supplied in ref.')
  }
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  validateTauriReleaseSource({
    tag,
    version: JSON.parse(readFileSync('package.json', 'utf8')).version,
    tauriVersion: JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version,
    commit: git('rev-parse', 'HEAD'),
    tagCommit: git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
  })
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`)
  }
  console.log(`Validated immutable Tauri release source: ${tag}`)
}
