import { spawnSync } from 'node:child_process'

if (process.platform !== 'darwin') {
  console.log('SKIP: native Finder clipboard check requires macOS')
  process.exit(0)
}
const compiled = spawnSync(
  'cargo',
  [
    'test',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--locked',
    '--no-run',
    '--message-format=json'
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
)
if (compiled.status !== 0) {
  process.stderr.write(compiled.stderr || 'Could not compile native clipboard tests')
  process.exit(compiled.status || 1)
}
const artifact = compiled.stdout
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .find((entry) => entry.reason === 'compiler-artifact' && entry.profile.test && entry.executable)
if (!artifact) {
  throw new Error('Missing native clipboard test executable')
}
const checked = spawnSync('swift', ['tests/tools/native-file-clipboard-check.swift'], {
  env: { ...process.env, ORCA_CLIPBOARD_TEST_BINARY: artifact.executable },
  stdio: 'inherit'
})
process.exitCode = checked.status ?? 1
