import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { getRgExecutable } from './ripgrep-executable'
import { buildRgArgs, createAccumulator, finalize, ingestRgJsonLine } from '../shared/text-search'

it('searches a plain folder using the bundled binary with an empty PATH', () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-bundled-rg-'))
  try {
    mkdirSync(join(root, '资料'))
    writeFileSync(join(root, '资料', '说明.md'), 'HOST host\n')
    const executable = getRgExecutable(root)
    expect(executable).not.toBe('rg')
    const output = execFileSync(executable, buildRgArgs('HOST', root, {}), {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: '' }
    })
    const acc = createAccumulator()
    for (const line of output.split('\n')) {
      ingestRgJsonLine(line, root, acc, 100)
    }
    const result = finalize(acc)
    expect(result.totalMatches).toBe(2)
    expect(result.files[0].filePath).toBe(join(root, '资料', '说明.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
