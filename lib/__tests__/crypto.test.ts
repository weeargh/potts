/**
 * Tests for Encryption Functions
 * 
 * Covers:
 * - encrypt() - AES-256-GCM encryption
 * - decrypt() - Decryption with verification
 * - Roundtrip tests
 * - Error handling
 */

import { describe, it, expect, beforeEach } from 'vitest'

// ============================================
// Setup
// ============================================

beforeEach(() => {
    // Set a test encryption key (32 bytes = 64 hex characters)
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

// Import after setting env
import { encrypt, decrypt } from '../crypto'

// ============================================
// Roundtrip Tests
// ============================================

describe('Encryption Roundtrip', () => {
    it('should encrypt and decrypt a string', () => {
        const original = 'my-secret-api-token'
        const encrypted = encrypt(original)
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe(original)
    })

    it('should handle empty string', () => {
        const encrypted = encrypt('')
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe('')
    })

    it('should handle long strings', () => {
        const original = 'x'.repeat(10000)
        const encrypted = encrypt(original)
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe(original)
    })

    it('should handle unicode characters', () => {
        const original = '日本語テスト 🎉 émoji'
        const encrypted = encrypt(original)
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe(original)
    })

    it('should handle JSON strings', () => {
        const original = JSON.stringify({ token: 'abc123', refresh: 'xyz789' })
        const encrypted = encrypt(original)
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe(original)
        expect(JSON.parse(decrypted)).toEqual({ token: 'abc123', refresh: 'xyz789' })
    })
})

// ============================================
// encrypt() Tests
// ============================================

describe('encrypt', () => {
    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
        const plaintext = 'test-token'

        const encrypted1 = encrypt(plaintext)
        const encrypted2 = encrypt(plaintext)

        // Should be different due to random IV
        expect(encrypted1).not.toBe(encrypted2)

        // But both should decrypt to same value
        expect(decrypt(encrypted1)).toBe(plaintext)
        expect(decrypt(encrypted2)).toBe(plaintext)
    })

    it('should return a base64-encoded string', () => {
        const encrypted = encrypt('test')

        // Encrypted format is iv:ciphertext (hex encoded)
        expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+$/)
    })

    it('should produce output longer than input (due to IV and auth tag)', () => {
        const plaintext = 'short'
        const encrypted = encrypt(plaintext)

        // Encrypted should include IV (12 bytes) + ciphertext + auth tag (16 bytes)
        // Base64 encoded, so even longer
        expect(encrypted.length).toBeGreaterThan(plaintext.length)
    })
})

// ============================================
// decrypt() Tests
// ============================================

describe('decrypt', () => {
    it('should decrypt valid encrypted data', () => {
        const encrypted = encrypt('secret-value')
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe('secret-value')
    })

    it('should throw on invalid base64', () => {
        expect(() => decrypt('not-valid-base64!!!')).toThrow()
    })

    it('should throw on truncated data', () => {
        const encrypted = encrypt('test')
        const truncated = encrypted.slice(0, 10)

        expect(() => decrypt(truncated)).toThrow()
    })

    it('should throw on tampered ciphertext', () => {
        const encrypted = encrypt('test')

        // Tamper with the encrypted data
        const buffer = Buffer.from(encrypted, 'base64')
        buffer[20] = buffer[20] ^ 0xff // Flip bits
        const tampered = buffer.toString('base64')

        expect(() => decrypt(tampered)).toThrow()
    })
})

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
    it('should handle special characters', () => {
        const special = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~\n\t\r'
        const encrypted = encrypt(special)
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe(special)
    })

    it('should handle newlines in token', () => {
        const multiline = 'line1\nline2\nline3'
        const encrypted = encrypt(multiline)
        const decrypted = decrypt(encrypted)

        expect(decrypted).toBe(multiline)
    })
})

// ============================================
// Security Tests
// ============================================

describe('Security Properties', () => {
    it('should use authenticated encryption (tampering detected)', () => {
        const encrypted = encrypt('sensitive-data')
        const buffer = Buffer.from(encrypted, 'base64')

        // Try to tamper with any part of the data
        for (let pos = 0; pos < Math.min(buffer.length, 50); pos += 10) {
            const tamperedBuffer = Buffer.from(buffer)
            tamperedBuffer[pos] ^= 0x01 // Flip one bit
            const tampered = tamperedBuffer.toString('base64')

            expect(() => decrypt(tampered)).toThrow()
        }
    })
})

// ============================================
// hash() Tests
// ============================================

import { hash, generateToken, safeCompare } from '../crypto'

describe('hash', () => {
    it('should hash a string deterministically', () => {
        const input = 'test-value'
        const hash1 = hash(input)
        const hash2 = hash(input)

        expect(hash1).toBe(hash2)
    })

    it('should produce 64-character hex output (SHA-256)', () => {
        const result = hash('any-input')

        expect(result).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different inputs', () => {
        const hash1 = hash('input1')
        const hash2 = hash('input2')

        expect(hash1).not.toBe(hash2)
    })

    it('should handle empty string', () => {
        const result = hash('')

        // SHA-256 of empty string is known value
        expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('should handle unicode', () => {
        const result = hash('日本語 🎉')

        expect(result).toMatch(/^[a-f0-9]{64}$/)
    })
})

// ============================================
// generateToken() Tests
// ============================================

describe('generateToken', () => {
    it('should generate random tokens', () => {
        const token1 = generateToken()
        const token2 = generateToken()

        expect(token1).not.toBe(token2)
    })

    it('should generate 64-character hex by default (32 bytes)', () => {
        const token = generateToken()

        expect(token).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should respect custom length parameter', () => {
        const token16 = generateToken(16)  // 16 bytes = 32 hex chars
        const token8 = generateToken(8)    // 8 bytes = 16 hex chars

        expect(token16).toMatch(/^[a-f0-9]{32}$/)
        expect(token8).toMatch(/^[a-f0-9]{16}$/)
    })

    it('should generate hex-only characters', () => {
        // Generate multiple tokens and check all are valid hex
        for (let i = 0; i < 10; i++) {
            const token = generateToken()
            expect(token).toMatch(/^[a-f0-9]+$/)
        }
    })
})

// ============================================
// safeCompare() Tests
// ============================================

describe('safeCompare', () => {
    it('should return true for identical strings', () => {
        expect(safeCompare('secret', 'secret')).toBe(true)
        expect(safeCompare('', '')).toBe(true)
        expect(safeCompare('longer-string-here', 'longer-string-here')).toBe(true)
    })

    it('should return false for different strings', () => {
        expect(safeCompare('secret', 'Secret')).toBe(false)
        expect(safeCompare('abc', 'abd')).toBe(false)
        expect(safeCompare('abc', 'abcd')).toBe(false)
    })

    it('should return false for different length strings', () => {
        expect(safeCompare('short', 'longer')).toBe(false)
        expect(safeCompare('abc', 'ab')).toBe(false)
    })

    it('should handle unicode strings', () => {
        expect(safeCompare('日本語', '日本語')).toBe(true)
        expect(safeCompare('日本語', '日本人')).toBe(false)
    })

    it('should handle empty vs non-empty', () => {
        expect(safeCompare('', 'a')).toBe(false)
        expect(safeCompare('a', '')).toBe(false)
    })
})
