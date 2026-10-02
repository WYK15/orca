import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import {
  parseForkCustomizationRegistry,
  validateForkCustomizationRegistry
} from './fork-customization-registry.mjs'

const CUSTOMIZATION_TRAILER = /^Fork-Customization:\s*(\S+)\s*$/
const BACKPORT_TRAILER = /^Upstream-Backport:\s*(\S+)\s*$/
const SENSITIVE_ENVIRONMENT_KEY = /(KEY|SECRET|TOKEN|PASSWORD)/i

function scrubEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !SENSITIVE_ENVIRONMENT_KEY.test(key))
  )
}

function trailerValues(body, pattern) {
  return body
    .split(/\r?\n/)
    .map((line) => pattern.exec(line)?.[1])
    .filter(Boolean)
}

export function readCustomizationCommits({ cwd, baseRef, headRef }) {
  const output = execFileSync(
    'git',
    ['log', '--reverse', '--format=%H%x00%s%x00%B%x00', `${baseRef}..${headRef}`],
    {
      cwd,
      encoding: 'utf8',
      env: scrubEnvironment(process.env)
    }
  )
  const fields = output.split('\0')
  const commits = []

  for (let index = 0; index + 2 < fields.length; index += 3) {
    const sha = fields[index].trim()
    if (!sha) {
      continue
    }
    const subject = fields[index + 1].trim()
    const body = fields[index + 2].trim()
    commits.push({
      sha,
      subject,
      customizationIds: trailerValues(body, CUSTOMIZATION_TRAILER),
      backports: trailerValues(body, BACKPORT_TRAILER)
    })
  }

  return commits
}

export function validateCustomizationCoverage(entries, commits) {
  const errors = []
  const registryIds = new Set(entries.map((entry) => entry.id))
  const counts = new Map(entries.map((entry) => [entry.id, 0]))
  const unknownIds = new Set()

  for (const commit of commits) {
    if (commit.customizationIds.length > 1) {
      errors.push(
        `Commit ${commit.sha} has ${commit.customizationIds.length} Fork-Customization trailers; expected at most 1`
      )
    }
    for (const id of commit.customizationIds) {
      if (!registryIds.has(id)) {
        unknownIds.add(id)
        continue
      }
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  for (const id of unknownIds) {
    errors.push(`Unregistered customization trailer: ${id}`)
  }

  for (const entry of entries) {
    const count = counts.get(entry.id) ?? 0
    if (entry.status === 'retired' && count > 0) {
      errors.push(`Retired customization ${entry.id} still appears in ${count} commit`)
      continue
    }
    if (entry.status !== 'retired' && count !== 1) {
      errors.push(`${entry.id} appears in ${count} commits; expected exactly 1`)
    }
  }

  return errors
}

function run(args) {
  const [registryPath, baseRef, headRef = 'HEAD'] = args
  if (!registryPath || !baseRef) {
    throw new Error(
      'Usage: fork-customization-commit-coverage.mjs <registry-path> <base-ref> [head-ref]'
    )
  }

  const entries = parseForkCustomizationRegistry(readFileSync(registryPath, 'utf8'))
  const registryErrors = validateForkCustomizationRegistry(entries)
  if (registryErrors.length > 0) {
    throw new Error(registryErrors.join('\n'))
  }

  const commits = readCustomizationCommits({ cwd: process.cwd(), baseRef, headRef })
  const coverageErrors = validateCustomizationCoverage(entries, commits)
  if (coverageErrors.length > 0) {
    throw new Error(coverageErrors.join('\n'))
  }

  const replayedCount = entries.filter((entry) => entry.status !== 'retired').length
  process.stdout.write(`Validated ${replayedCount} replayed fork customizations\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
