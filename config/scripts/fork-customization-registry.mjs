import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const STATUSES = new Set(['active', 'upstream-candidate', 'retired'])
const ID_PATTERN = /^ORCAW-\d{3}$/
const FIELDS = [
  'id',
  'title',
  'status',
  'introduced',
  'contract',
  'scope',
  'verification',
  'upstream'
]

export function parseForkCustomizationRegistry(markdown) {
  const section = markdown.split(/^## Customization Registry\s*$/m)[1]?.split(/^## /m)[0]
  if (!section) {
    throw new Error('Missing ## Customization Registry table')
  }

  const rows = section
    .split('\n')
    .filter((line) => /^\|\s*ORCAW-|^\|\s*FORK-/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
    )

  return rows.map((cells) =>
    Object.fromEntries(FIELDS.map((field, index) => [field, cells[index] ?? '']))
  )
}

export function getForkCustomizationVerificationPaths(entries) {
  return entries.flatMap(({ verification }) =>
    Array.from(verification.matchAll(/`([^`\r\n]+)`/g), ([, path]) => path)
  )
}

export function validateForkCustomizationRegistry(entries) {
  const errors = []
  const seen = new Set()

  for (const entry of entries) {
    if (!ID_PATTERN.test(entry.id)) {
      errors.push(`Invalid customization ID: ${entry.id}`)
    }
    if (seen.has(entry.id)) {
      errors.push(`Duplicate customization ID: ${entry.id}`)
    }
    seen.add(entry.id)
    if (!STATUSES.has(entry.status)) {
      errors.push(`${entry.id} has invalid status: ${entry.status}`)
    }
    for (const field of FIELDS.slice(1)) {
      if (!entry[field]) {
        errors.push(`${entry.id} is missing ${field}`)
      }
    }
  }

  return errors
}

function run(path) {
  const entries = parseForkCustomizationRegistry(readFileSync(path, 'utf8'))
  const errors = validateForkCustomizationRegistry(entries)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
  process.stdout.write(`Validated ${entries.length} fork customizations\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv[2] ?? 'FORK_NOTES.md')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
