#!/usr/bin/env node

const required = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
]

const missing = required.filter((key) => {
  const value = process.env[key]
  return typeof value !== 'string' || value.trim().length === 0
})

if (missing.length > 0) {
  // Why: local developers still need ad-hoc builds for validation, but the
  // production release path must fail fast instead of silently shipping an
  // unsigned, unnotarized app that only looked successful in CI logs.
  console.error('Missing required macOS release signing environment variables:')
  for (const key of missing) {
    console.error(`- ${key}`)
  }
  console.error('')
  console.error('Use `pnpm build:mac` for local ad-hoc builds, or provide the')
  console.error('Developer ID + notarization credentials before running the')
  console.error('production release build.')
  process.exit(1)
}
