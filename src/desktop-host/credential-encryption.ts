import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = Buffer.from('\0orcaw-tauri-v1\0')
const NONCE_BYTES = 12
const TAG_BYTES = 16
let masterKey: Buffer | undefined

export function initializeCredentialEncryption(encoded: unknown): void {
  if (typeof encoded !== 'string') {
    throw new Error('Desktop credential encryption key is unavailable')
  }
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.length !== 32 || decoded.toString('base64') !== encoded) {
    throw new Error('Invalid desktop credential encryption key')
  }
  if (masterKey) {
    decoded.fill(0)
    throw new Error('Desktop credential encryption is already initialized')
  }
  masterKey = decoded
}

function key(): Buffer {
  if (!masterKey) {
    throw new Error('Desktop credential encryption has not been unlocked')
  }
  return masterKey
}

export const credentialEncryption = {
  isEncryptionAvailable: (): boolean => masterKey !== undefined,
  encryptString: (text: string): Buffer => {
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key(), nonce)
    cipher.setAAD(PREFIX)
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return Buffer.concat([PREFIX, nonce, cipher.getAuthTag(), encrypted])
  },
  decryptString: (bytes: Buffer): string => {
    if (
      bytes.length < PREFIX.length + NONCE_BYTES + TAG_BYTES ||
      !bytes.subarray(0, PREFIX.length).equals(PREFIX)
    ) {
      throw new Error('Unrecognized desktop credential ciphertext')
    }
    const nonceEnd = PREFIX.length + NONCE_BYTES
    const tagEnd = nonceEnd + TAG_BYTES
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(PREFIX.length, nonceEnd))
    decipher.setAAD(PREFIX)
    decipher.setAuthTag(bytes.subarray(nonceEnd, tagEnd))
    return Buffer.concat([decipher.update(bytes.subarray(tagEnd)), decipher.final()]).toString(
      'utf8'
    )
  }
}

export function clearCredentialEncryption(): void {
  masterKey?.fill(0)
  masterKey = undefined
}
