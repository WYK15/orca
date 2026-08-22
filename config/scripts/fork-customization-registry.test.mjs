import { describe, expect, it } from 'vitest'
import {
  parseForkCustomizationRegistry,
  validateForkCustomizationRegistry
} from './fork-customization-registry.mjs'

const HEADER = `| ID | Title | Status | Introduced | Contract | Scope | Verification | Upstream |
| --- | --- | --- | --- | --- | --- | --- | --- |`

function registry(...rows) {
  return `# Fork Notes\n\n## Customization Registry\n\n${HEADER}\n${rows.join('\n')}\n`
}

describe('fork customization registry', () => {
  it('parses an active customization', () => {
    const entries = parseForkCustomizationRegistry(
      registry(
        '| ORCAW-001 | Independent identity | active | 1.4.165-wyk.4 | Keep isolated identity | `config/orcaw-product-identity.json` | `config/scripts/electron-builder-product-identity.test.mjs` | none |'
      )
    )

    expect(entries).toEqual([
      {
        id: 'ORCAW-001',
        title: 'Independent identity',
        status: 'active',
        introduced: '1.4.165-wyk.4',
        contract: 'Keep isolated identity',
        scope: '`config/orcaw-product-identity.json`',
        verification: '`config/scripts/electron-builder-product-identity.test.mjs`',
        upstream: 'none'
      }
    ])
  })

  it.each(['active', 'upstream-candidate', 'retired'])('accepts status %s', (status) => {
    const entries = parseForkCustomizationRegistry(
      registry(
        `| ORCAW-001 | Identity | ${status} | 1.4.165-wyk.4 | Contract | scope | test | none |`
      )
    )

    expect(validateForkCustomizationRegistry(entries)).toEqual([])
  })

  it('rejects duplicate IDs, missing fields, malformed IDs, and unknown statuses', () => {
    const entries = parseForkCustomizationRegistry(
      registry(
        '| ORCAW-001 | Identity | active | 1.4.165-wyk.4 | Contract | scope | test | none |',
        '| ORCAW-001 | Duplicate | unknown | | Contract | scope | test | none |',
        '| FORK-2 | Invalid | active | 1.4.165-wyk.4 | Contract | scope | test | none |'
      )
    )

    expect(validateForkCustomizationRegistry(entries)).toEqual(
      expect.arrayContaining([
        'Duplicate customization ID: ORCAW-001',
        'ORCAW-001 has invalid status: unknown',
        'ORCAW-001 is missing introduced',
        'Invalid customization ID: FORK-2'
      ])
    )
  })

  it('fails when the registry section is absent', () => {
    expect(() => parseForkCustomizationRegistry('# Fork Notes\n')).toThrow(
      'Missing ## Customization Registry table'
    )
  })
})
