import { pathToFileURL } from 'node:url'

const IDENTIFIER = '[0-9A-Za-z-]+'
const VERSION_PATTERN = new RegExp(
  `^v(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?(?:\\+${IDENTIFIER}(?:\\.${IDENTIFIER})*)?$`
)
const FORK_RELEASE_PATTERN = /^wyk\.(0|[1-9]\d*)$/

export function getReleasePublicationKind(tag) {
  const match = VERSION_PATTERN.exec(tag)
  if (!match) {
    throw new Error(`Invalid release tag: ${tag}`)
  }

  const prerelease = match[4]
  return !prerelease || FORK_RELEASE_PATTERN.test(prerelease) ? 'release' : 'prerelease'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${getReleasePublicationKind(process.argv[2] ?? '')}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
