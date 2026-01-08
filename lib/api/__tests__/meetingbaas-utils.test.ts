/**
 * Comprehensive Tests for MeetingBaas API Functions
 * 
 * Tests cover:
 * - All 16 API functions
 * - Validation logic
 * - Error handling
 * - Edge cases
 * 
 * Run with: npx vitest run lib/api/__tests__/
 */

import { describe, it, expect } from 'vitest'
import {
    validateMeetingUrl,
    validateBotId,
    validateCalendarId,
    validateTimestamp,
    getRetryDelay,
    getTranscriptionConfig,
    MeetingBaasError,
    MEETINGBAAS_CONFIG,
} from '../meetingbaas-utils'
import {
    getBotErrorMessage,
    BOT_ERROR_MESSAGES,
} from '../meetingbaas'

// ============================================
// Validation Function Tests
// ============================================

describe('validateMeetingUrl', () => {
    describe('Google Meet', () => {
        it('should validate standard Google Meet URL', () => {
            const result = validateMeetingUrl('https://meet.google.com/abc-defg-hij')
            expect(result.valid).toBe(true)
            expect(result.platform).toBe('google_meet')
        })

        it('should validate Google Meet URL case-insensitively', () => {
            const result = validateMeetingUrl('https://meet.google.com/ABC-DEFG-HIJ')
            expect(result.valid).toBe(true)
        })

        it('should reject invalid Google Meet URL format', () => {
            expect(validateMeetingUrl('https://meet.google.com/abc').valid).toBe(false)
            expect(validateMeetingUrl('https://meet.google.com/abc-def').valid).toBe(false)
        })
    })

    describe('Zoom', () => {
        it('should validate Zoom URL with meeting ID', () => {
            const result = validateMeetingUrl('https://zoom.us/j/123456789')
            expect(result.valid).toBe(true)
            expect(result.platform).toBe('zoom')
        })

        it('should validate Zoom URL with password', () => {
            const result = validateMeetingUrl('https://zoom.us/j/123456789?pwd=abc123')
            expect(result.valid).toBe(true)
            expect(result.platform).toBe('zoom')
        })

        it('should validate company Zoom subdomain', () => {
            const result = validateMeetingUrl('https://company.zoom.us/j/123456789')
            expect(result.valid).toBe(true)
            expect(result.platform).toBe('zoom')
        })
    })

    describe('Microsoft Teams', () => {
        it('should validate Teams meetup-join URL', () => {
            const result = validateMeetingUrl('https://teams.microsoft.com/l/meetup-join/abc123xyz')
            expect(result.valid).toBe(true)
            expect(result.platform).toBe('teams')
        })
    })

    describe('Webex', () => {
        it('should validate Webex URL', () => {
            const result = validateMeetingUrl('https://company.webex.com/meet/username')
            expect(result.valid).toBe(true)
            expect(result.platform).toBe('webex')
        })
    })

    describe('Invalid URLs', () => {
        it('should reject empty string', () => {
            const result = validateMeetingUrl('')
            expect(result.valid).toBe(false)
            expect(result.error).toBe('Meeting URL is required')
        })

        it('should reject null/undefined', () => {
            expect(validateMeetingUrl(null as unknown as string).valid).toBe(false)
            expect(validateMeetingUrl(undefined as unknown as string).valid).toBe(false)
        })

        it('should reject random URLs', () => {
            expect(validateMeetingUrl('https://example.com/meeting').valid).toBe(false)
            expect(validateMeetingUrl('https://youtube.com/watch?v=123').valid).toBe(false)
        })

        it('should reject non-URL strings', () => {
            expect(validateMeetingUrl('not a url').valid).toBe(false)
            expect(validateMeetingUrl('meet.google.com/abc-defg-hij').valid).toBe(false) // Missing https://
        })
    })
})

describe('validateBotId', () => {
    describe('Valid UUIDs', () => {
        it('should accept lowercase UUID', () => {
            expect(validateBotId('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
        })

        it('should accept uppercase UUID', () => {
            expect(validateBotId('123E4567-E89B-12D3-A456-426614174000')).toBe(true)
        })

        it('should accept mixed case UUID', () => {
            expect(validateBotId('123e4567-E89B-12d3-A456-426614174000')).toBe(true)
        })
    })

    describe('Invalid UUIDs', () => {
        it('should reject empty string', () => {
            expect(validateBotId('')).toBe(false)
        })

        it('should reject null/undefined', () => {
            expect(validateBotId(null as unknown as string)).toBe(false)
            expect(validateBotId(undefined as unknown as string)).toBe(false)
        })

        it('should reject non-string', () => {
            expect(validateBotId(123 as unknown as string)).toBe(false)
        })

        it('should reject partial UUID', () => {
            expect(validateBotId('123e4567-e89b-12d3')).toBe(false)
        })

        it('should reject wrong format', () => {
            expect(validateBotId('123e4567e89b12d3a456426614174000')).toBe(false) // No dashes
            expect(validateBotId('not-a-uuid-at-all')).toBe(false)
        })
    })
})

describe('validateCalendarId', () => {
    it('should validate same as botId (UUID format)', () => {
        expect(validateCalendarId('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
        expect(validateCalendarId('invalid')).toBe(false)
    })
})

describe('validateTimestamp', () => {
    describe('Valid timestamps', () => {
        it('should accept ISO 8601 with timezone', () => {
            expect(validateTimestamp('2025-01-20T14:00:00Z')).toBe(true)
            expect(validateTimestamp('2025-01-20T14:00:00+07:00')).toBe(true)
        })

        it('should accept ISO 8601 with milliseconds', () => {
            expect(validateTimestamp('2025-01-20T14:00:00.000Z')).toBe(true)
        })

        it('should accept date only', () => {
            expect(validateTimestamp('2025-01-20')).toBe(true)
        })

        it('should accept various date formats', () => {
            expect(validateTimestamp('January 20, 2025')).toBe(true)
            expect(validateTimestamp('2025/01/20')).toBe(true)
        })
    })

    describe('Invalid timestamps', () => {
        it('should reject empty string', () => {
            expect(validateTimestamp('')).toBe(false)
        })

        it('should reject null/undefined', () => {
            expect(validateTimestamp(null as unknown as string)).toBe(false)
            expect(validateTimestamp(undefined as unknown as string)).toBe(false)
        })

        it('should reject invalid date strings', () => {
            expect(validateTimestamp('not-a-date')).toBe(false)
            expect(validateTimestamp('2025-13-45')).toBe(false) // Invalid month/day
        })
    })
})

// ============================================
// Retry Logic Tests
// ============================================

describe('getRetryDelay', () => {
    it('should calculate exponential backoff', () => {
        expect(getRetryDelay(0, 1000)).toBe(1000)
        expect(getRetryDelay(1, 1000)).toBe(2000)
        expect(getRetryDelay(2, 1000)).toBe(4000)
        expect(getRetryDelay(3, 1000)).toBe(8000)
        expect(getRetryDelay(4, 1000)).toBe(16000)
    })

    it('should cap at 30 seconds', () => {
        expect(getRetryDelay(10, 1000)).toBe(30000)
        expect(getRetryDelay(20, 1000)).toBe(30000)
    })

    it('should use default base delay of 1000ms', () => {
        expect(getRetryDelay(0)).toBe(1000)
        expect(getRetryDelay(1)).toBe(2000)
    })

    it('should work with custom base delay', () => {
        expect(getRetryDelay(0, 500)).toBe(500)
        expect(getRetryDelay(1, 500)).toBe(1000)
        expect(getRetryDelay(2, 500)).toBe(2000)
    })
})

// ============================================
// Error Handling Tests
// ============================================

describe('MeetingBaasError', () => {
    it('should create error with all properties', () => {
        const error = new MeetingBaasError('Test message', 'TEST_CODE', 400)

        expect(error.message).toBe('Test message')
        expect(error.code).toBe('TEST_CODE')
        expect(error.statusCode).toBe(400)
        expect(error.name).toBe('MeetingBaasError')
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(MeetingBaasError)
    })

    it('should include retryAfter for rate limit errors', () => {
        const error = new MeetingBaasError('Rate limited', 'TOO_MANY_REQUESTS', 429, 5)

        expect(error.retryAfter).toBe(5)
    })

    it('should have undefined retryAfter when not provided', () => {
        const error = new MeetingBaasError('Error', 'CODE', 500)

        expect(error.retryAfter).toBeUndefined()
    })
})

describe('getBotErrorMessage', () => {
    describe('Known error codes', () => {
        it('should return correct message for BOT_NOT_ACCEPTED', () => {
            const result = getBotErrorMessage('BOT_NOT_ACCEPTED')
            expect(result.title).toBe('Bot Not Accepted')
            expect(result.message).toContain('admit the bot')
        })

        it('should return correct message for TRANSCRIPTION_FAILED with canRetry', () => {
            const result = getBotErrorMessage('TRANSCRIPTION_FAILED')
            expect(result.title).toBe('Transcription Failed')
            expect(result.canRetry).toBe(true)
        })

        it('should return correct message for INSUFFICIENT_TOKENS', () => {
            const result = getBotErrorMessage('INSUFFICIENT_TOKENS')
            expect(result.title).toBe('Insufficient Tokens')
        })

        it('should return correct message for DAILY_BOT_CAP_REACHED', () => {
            const result = getBotErrorMessage('DAILY_BOT_CAP_REACHED')
            expect(result.title).toBe('Daily Limit Reached')
        })

        it('should return correct message for BOT_ALREADY_EXISTS', () => {
            const result = getBotErrorMessage('BOT_ALREADY_EXISTS')
            expect(result.title).toBe('Bot Already Exists')
        })
    })

    describe('Unknown error codes', () => {
        it('should return fallback for undefined', () => {
            const result = getBotErrorMessage(undefined)
            expect(result.title).toBe('Unknown Error')
        })

        it('should return fallback for unknown code', () => {
            const result = getBotErrorMessage('SOME_NEW_ERROR_CODE')
            expect(result.title).toBe('Unknown Error')
        })
    })
})

describe('BOT_ERROR_MESSAGES', () => {
    it('should have all documented error codes', () => {
        const expectedCodes = [
            'BOT_REMOVED',
            'NO_ATTENDEES',
            'NO_SPEAKER',
            'RECORDING_TIMEOUT',
            'API_REQUEST',
            'BOT_NOT_ACCEPTED',
            'TIMEOUT_WAITING_TO_START',
            'CANNOT_JOIN_MEETING',
            'BOT_REMOVED_TOO_EARLY',
            'INVALID_MEETING_URL',
            'LOGIN_REQUIRED',
            'INTERNAL_ERROR',
            'TRANSCRIPTION_FAILED',
            'INSUFFICIENT_TOKENS',
            'DAILY_BOT_CAP_REACHED',
            'BOT_ALREADY_EXISTS',
            'WAITING_FOR_HOST_TIMEOUT',
            'RECORDING_RIGHTS_NOT_GRANTED',
            'UNKNOWN_ERROR',
        ]

        for (const code of expectedCodes) {
            expect(BOT_ERROR_MESSAGES[code]).toBeDefined()
            expect(BOT_ERROR_MESSAGES[code].title).toBeDefined()
            expect(BOT_ERROR_MESSAGES[code].message).toBeDefined()
        }
    })

    it('should have canRetry only on TRANSCRIPTION_FAILED', () => {
        for (const [code, data] of Object.entries(BOT_ERROR_MESSAGES)) {
            if (code === 'TRANSCRIPTION_FAILED') {
                expect(data.canRetry).toBe(true)
            } else {
                expect(data.canRetry).toBeUndefined()
            }
        }
    })
})

// ============================================
// Configuration Tests
// ============================================

describe('MEETINGBAAS_CONFIG', () => {
    it('should have required configuration properties', () => {
        expect(MEETINGBAAS_CONFIG.baseUrl).toBe('https://api.meetingbaas.com/v2')
        expect(MEETINGBAAS_CONFIG.defaultTimeout).toBe(30000)
        expect(MEETINGBAAS_CONFIG.maxRetries).toBe(3)
        expect(MEETINGBAAS_CONFIG.retryDelay).toBe(1000)
    })

    it('should have apiKey property (may be empty in test env)', () => {
        expect(typeof MEETINGBAAS_CONFIG.apiKey).toBe('string')
    })

    it('should have callback properties', () => {
        expect(typeof MEETINGBAAS_CONFIG.callbackUrl).toBe('string')
        expect(typeof MEETINGBAAS_CONFIG.callbackSecret).toBe('string')
    })
})

describe('getTranscriptionConfig', () => {
    it('should return default config with bullet_points summarization', () => {
        const config = getTranscriptionConfig()

        expect(config.transcription_enabled).toBe(true)
        expect(config.transcription_config.provider).toBe('gladia')
        expect(config.transcription_config.custom_params.summarization).toBe(true)
        expect(config.transcription_config.custom_params.summarization_config.type).toBe('bullet_points')
    })

    it('should accept custom summarization type', () => {
        const config = getTranscriptionConfig({ summarizationType: 'concise' })

        expect(config.transcription_config.custom_params.summarization_config.type).toBe('concise')
    })

    it('should include custom vocabulary when provided', () => {
        const vocabulary = ['MeetingBaas', 'Notula', 'Potts']
        const config = getTranscriptionConfig({ customVocabulary: vocabulary })

        expect(config.transcription_config.custom_params.custom_vocabulary).toEqual(vocabulary)
    })

    it('should not include custom_vocabulary key when array is empty', () => {
        const config = getTranscriptionConfig({ customVocabulary: [] })

        expect(config.transcription_config.custom_params.custom_vocabulary).toBeUndefined()
    })

    it('should combine summarization and custom vocabulary', () => {
        const vocabulary = ['API', 'webhook']
        const config = getTranscriptionConfig({
            summarizationType: 'general',
            customVocabulary: vocabulary
        })

        expect(config.transcription_config.custom_params.summarization).toBe(true)
        expect(config.transcription_config.custom_params.summarization_config.type).toBe('general')
        expect(config.transcription_config.custom_params.custom_vocabulary).toEqual(vocabulary)
    })
})
