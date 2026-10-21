import { afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  clearCredentialEncryption,
  credentialEncryption,
  initializeCredentialEncryption
} from './credential-encryption'

afterEach(clearCredentialEncryption)

describe('desktop credential encryption', () => {
  it('authenticates Unicode secrets across restarts without deterministic ciphertext', () => {
    const key = randomBytes(32).toString('base64')
    initializeCredentialEncryption(key)
    const text = '令牌 secret / 🐋'
    const first = credentialEncryption.encryptString(text)
    expect(first.includes(Buffer.from(text))).toBe(false)
    expect(credentialEncryption.encryptString(text)).not.toEqual(first)
    clearCredentialEncryption()
    initializeCredentialEncryption(key)
    expect(credentialEncryption.decryptString(first)).toBe(text)
    const altered = Buffer.from(first)
    altered[altered.length - 1] ^= 1
    expect(() => credentialEncryption.decryptString(altered)).toThrow()
    clearCredentialEncryption()
    initializeCredentialEncryption(randomBytes(32).toString('base64'))
    expect(() => credentialEncryption.decryptString(first)).toThrow()
  })

  it('rejects invalid keys and unrecognized ciphertext before encryption is usable', () => {
    expect(credentialEncryption.isEncryptionAvailable()).toBe(false)
    expect(() => credentialEncryption.encryptString('secret')).toThrow('unlocked')
    for (const key of [null, '', '***', Buffer.alloc(31).toString('base64')]) {
      expect(() => initializeCredentialEncryption(key)).toThrow()
    }
    initializeCredentialEncryption(randomBytes(32).toString('base64'))
    expect(() => credentialEncryption.decryptString(Buffer.from('legacy plaintext'))).toThrow(
      'Unrecognized'
    )
    expect(() => initializeCredentialEncryption(randomBytes(32).toString('base64'))).toThrow(
      'already initialized'
    )
    const encrypted = credentialEncryption.encryptString('')
    expect(credentialEncryption.decryptString(encrypted)).toBe('')
  })
})
