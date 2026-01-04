/**
 * Encryption utilities for sensitive data (OAuth tokens, etc.)
 * Uses AES-256-CBC encryption
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

/**
 * Get encryption key from environment variable
 * Key must be 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. Generate one with: openssl rand -hex 32'
    )
  }

  if (key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32'
    )
  }

  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a string value
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format: iv:encryptedData (hex)
 */
export function encrypt(text: string): string {
  try {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Return iv:encrypted format
    return iv.toString('hex') + ':' + encrypted
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt an encrypted string
 * @param encryptedText - The encrypted text in format: iv:encryptedData (hex)
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedText: string): string {
  try {
    const key = getEncryptionKey()
    const parts = encryptedText.split(':')

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error('Invalid encrypted text format')
    }

    const iv = Buffer.from(parts[0], 'hex')
    const encryptedData = parts[1]

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    console.error('Decryption error:', error)
    throw new Error('Failed to decrypt data')
  }
}

/**
 * Hash a value using SHA-256
 * @param text - The text to hash
 * @returns Hashed string (hex)
 */
export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * Generate a secure random token
 * @param length - Length in bytes (default: 32)
 * @returns Random token (hex)
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}
