import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  getForkCustomizationVerificationPaths,
  parseForkCustomizationRegistry,
  validateForkCustomizationRegistry
} from './fork-customization-registry.mjs'
import {
  readCustomizationCommits,
  validateCustomizationCoverage
} from './fork-customization-commit-coverage.mjs'
import { parseStableUpstreamTag } from './fork-release-contract.mjs'

const SENSITIVE_ENVIRONMENT_KEY = /(KEY|SECRET|TOKEN|PASSWORD)/i

function scrubEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !SENSITIVE_ENVIRONMENT_KEY.test(key))
  )
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: scrubEnvironment(process.env)
  }).trim()
}

function resolveCommit(cwd, ref) {
  return git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`])
}

function assertCleanWorkingTree(cwd) {
  if (git(cwd, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Candidate working tree must be clean')
  }
}

function assertUpstreamPackageVersion(cwd, upstreamTag, version) {
  const packageJson = git(cwd, ['show', `${upstreamTag}:package.json`])
  let packageVersion
  try {
    packageVersion = JSON.parse(packageJson).version
  } catch {
    throw new Error(`Invalid package.json at ${upstreamTag}`)
  }
  if (packageVersion !== version) {
    throw new Error(`Upstream package version ${packageVersion} does not match ${upstreamTag}`)
  }
}

function assertCandidateDescendsFromUpstream(cwd, upstreamHead, candidateHead) {
  try {
    git(cwd, ['merge-base', '--is-ancestor', upstreamHead, candidateHead])
  } catch {
    throw new Error(`Candidate ${candidateHead} does not descend from upstream ${upstreamHead}`)
  }
}

function assertNoReleaseCommits(commits) {
  const releases = commits.filter((commit) => /^chore\(release\):/i.test(commit.subject))
  if (releases.length > 0) {
    throw new Error(
      `Candidate contains release commit(s): ${releases.map((commit) => commit.sha).join(', ')}`
    )
  }
}

function assertVerificationPaths(cwd, paths) {
  for (const path of paths) {
    const absolutePath = resolve(cwd, path)
    const pathFromRoot = relative(cwd, absolutePath)
    if (
      !path ||
      isAbsolute(path) ||
      path.startsWith('-') ||
      pathFromRoot === '' ||
      pathFromRoot === '..' ||
      pathFromRoot.startsWith('../') ||
      pathFromRoot.startsWith('..\\') ||
      !existsSync(absolutePath) ||
      !statSync(absolutePath).isFile()
    ) {
      throw new Error(`Invalid verification test path: ${path}`)
    }
  }
}

export function runVitest(paths, { cwd, spawn = spawnSync } = {}) {
  const result = spawn(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'vitest', 'run', '--config', 'config/vitest.config.ts', '--', ...paths],
    {
      cwd,
      env: scrubEnvironment(process.env),
      shell: false,
      stdio: 'inherit'
    }
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Vitest failed with status ${result.status ?? 'unknown'}`)
  }
}

export function runForkUpstreamAdoption({
  cwd = process.cwd(),
  upstreamTag,
  candidateHead = 'HEAD',
  id,
  runVitest: runTests = runVitest
}) {
  const { version } = parseStableUpstreamTag(upstreamTag)
  const upstreamHead = resolveCommit(cwd, `refs/tags/${upstreamTag}`)
  const resolvedCandidateHead = resolveCommit(cwd, candidateHead)
  assertCleanWorkingTree(cwd)
  assertUpstreamPackageVersion(cwd, `refs/tags/${upstreamTag}`, version)
  assertCandidateDescendsFromUpstream(cwd, upstreamHead, resolvedCandidateHead)

  const registryPath = resolve(cwd, 'FORK_NOTES.md')
  const entries = parseForkCustomizationRegistry(readFileSync(registryPath, 'utf8'))
  const registryErrors = validateForkCustomizationRegistry(entries)
  if (registryErrors.length > 0) {
    throw new Error(registryErrors.join('\n'))
  }

  const commits = readCustomizationCommits({
    cwd,
    baseRef: upstreamHead,
    headRef: resolvedCandidateHead
  })
  const coverageErrors = validateCustomizationCoverage(entries, commits)
  if (coverageErrors.length > 0) {
    throw new Error(coverageErrors.join('\n'))
  }
  assertNoReleaseCommits(commits)

  const selectedEntries = id ? entries.filter((entry) => entry.id === id) : entries
  if (id && selectedEntries.length === 0) {
    throw new Error(`Unknown customization ID: ${id}`)
  }
  if (selectedEntries.some((entry) => entry.status === 'retired')) {
    throw new Error('Retired customizations have no replay verification')
  }

  const ids = selectedEntries.map((entry) => entry.id)
  const testPaths = [...new Set(getForkCustomizationVerificationPaths(selectedEntries))]
  if (testPaths.length === 0) {
    throw new Error(`No verification test paths found for ${ids.join(', ')}`)
  }
  assertVerificationPaths(cwd, testPaths)
  runTests(testPaths, { cwd })
  return { ids, testPaths }
}

export function parseForkUpstreamAdoptionArguments(args) {
  const values = []
  let id

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--id') {
      if (id !== undefined || !args[index + 1]) {
        throw new Error(
          'Usage: fork-upstream-adoption.mjs <stable-upstream-tag> [candidate-head] [--id <ORCAW-NNN>]'
        )
      }
      id = args[index + 1]
      index += 1
    } else {
      values.push(args[index])
    }
  }
  if (!values[0] || values.length > 2) {
    throw new Error(
      'Usage: fork-upstream-adoption.mjs <stable-upstream-tag> [candidate-head] [--id <ORCAW-NNN>]'
    )
  }
  return { upstreamTag: values[0], candidateHead: values[1], id }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { upstreamTag, candidateHead, id } = parseForkUpstreamAdoptionArguments(
      process.argv.slice(2)
    )
    const result = runForkUpstreamAdoption({ upstreamTag, candidateHead, id })
    process.stdout.write(
      `Validated fork adoption for ${result.ids.join(', ')} with ${result.testPaths.length} test paths\n`
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
