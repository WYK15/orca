import { pathToFileURL } from 'node:url'

const STABLE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const FORK_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-wyk\.([1-9]\d*)$/

export function parseStableUpstreamTag(tag) {
  const match = STABLE_TAG_PATTERN.exec(tag)
  if (!match) {
    throw new Error(`Stable upstream tag required: ${tag}`)
  }
  return { tag, version: `${match[1]}.${match[2]}.${match[3]}` }
}

export function getForkReleaseVersion(upstreamVersion, revision) {
  if (!STABLE_VERSION_PATTERN.test(upstreamVersion)) {
    throw new Error(`Stable upstream version required: ${upstreamVersion}`)
  }
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error('Fork revision must be positive')
  }
  return `${upstreamVersion}-wyk.${revision}`
}

export function validateForkRelease({
  upstreamTag,
  upstreamPackageVersion,
  forkPackageVersion,
  releaseTag
}) {
  const errors = []
  let upstreamVersion

  try {
    upstreamVersion = parseStableUpstreamTag(upstreamTag).version
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    return errors
  }

  if (upstreamPackageVersion !== upstreamVersion) {
    errors.push(`Upstream package version ${upstreamPackageVersion} does not match ${upstreamTag}`)
  }

  const forkMatch = FORK_VERSION_PATTERN.exec(forkPackageVersion)
  const forkBase = forkMatch ? `${forkMatch[1]}.${forkMatch[2]}.${forkMatch[3]}` : undefined
  if (forkBase !== upstreamVersion) {
    errors.push(`Fork package version must start with ${upstreamVersion}-wyk.`)
  }

  if (releaseTag !== `v${forkPackageVersion}`) {
    errors.push(
      `Release tag ${releaseTag} does not match fork package version ${forkPackageVersion}`
    )
  }

  return errors
}

function run(args) {
  const [mode, ...values] = args
  if (mode === '--stable-tag' && values.length === 1) {
    const { tag } = parseStableUpstreamTag(values[0])
    process.stdout.write(`Stable upstream tag valid: ${tag}\n`)
    return
  }
  if (mode === '--release' && values.length === 4) {
    const errors = validateForkRelease({
      upstreamTag: values[0],
      upstreamPackageVersion: values[1],
      forkPackageVersion: values[2],
      releaseTag: values[3]
    })
    if (errors.length > 0) {
      throw new Error(errors.join('\n'))
    }
    process.stdout.write('Fork release contract valid\n')
    return
  }
  throw new Error(
    'Usage: fork-release-contract.mjs --stable-tag <tag> | --release <tag> <upstream-version> <fork-version> <release-tag>'
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
