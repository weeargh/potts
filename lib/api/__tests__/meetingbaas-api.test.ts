/**
 * Integration-style Tests for MeetingBaas API Functions
 * 
 * These tests mock fetch to test the API function behavior
 * without making actual network requests.
 * 
 * Run with: npx vitest run lib/api/__tests__/
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MeetingBaasError } from '../meetingbaas-utils'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the SDK client
vi.mock('@meeting-baas/sdk', () => ({
    createBaasClient: () => ({
        createBot: vi.fn().mockResolvedValue({
            success: true,
            data: { bot_id: '12345678-1234-5678-90ab-cdef12345678' }
        })
    })
}))

// Import after mocking
import {
    getBotStatus,
    listBots,
    leaveMeeting,
    deleteBotData,
    cancelScheduledBot,
    retryTranscription,
    listCalendars,
    listCalendarEvents,
    deleteCalendar,
} from '../meetingbaas'

// ============================================
// Test Helpers
// ============================================

function mockSuccessResponse<T>(data: T) {
    mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data }),
    })
}

// Helper functions removed: mockErrorResponse, mockRateLimitResponse (unused)

// ============================================
// Bot Function Tests
// ============================================

describe('getBotStatus', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw MeetingBaasError for invalid bot ID', async () => {
        await expect(getBotStatus('invalid-id'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should throw MeetingBaasError with VALIDATION_ERROR code', async () => {
        try {
            await getBotStatus('invalid-id')
        } catch (error) {
            expect(error).toBeInstanceOf(MeetingBaasError)
            expect((error as MeetingBaasError).code).toBe('VALIDATION_ERROR')
            expect((error as MeetingBaasError).statusCode).toBe(400)
        }
    })

    it('should fetch bot status for valid ID', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        const mockData = {
            bot_id: validId,
            status: 'completed',
            bot_name: 'Test Bot',
        }
        mockSuccessResponse(mockData)

        const result = await getBotStatus(validId)
        expect(result.bot_id).toBe(validId)
        expect(result.status).toBe('completed')
    })
})

describe('listBots', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should return array of bots', async () => {
        const mockBots = [
            { bot_id: 'bot-1', status: 'completed' },
            { bot_id: 'bot-2', status: 'in_call_recording' },
        ]
        mockSuccessResponse(mockBots)

        const result = await listBots()
        expect(result).toHaveLength(2)
        expect(result[0].bot_id).toBe('bot-1')
    })

    it('should return empty array when no bots', async () => {
        mockSuccessResponse([])

        const result = await listBots()
        expect(result).toHaveLength(0)
    })
})

describe('leaveMeeting', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw MeetingBaasError for invalid bot ID', async () => {
        await expect(leaveMeeting('invalid'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should return success message for valid bot ID', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse({ message: 'Leave request sent' })

        const result = await leaveMeeting(validId)
        expect(result.message).toBeDefined()
    })
})

describe('deleteBotData', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw MeetingBaasError for invalid bot ID', async () => {
        await expect(deleteBotData('invalid'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should return deleted: true for valid bot ID', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse({ deleted: true })

        const result = await deleteBotData(validId)
        expect(result.deleted).toBe(true)
    })
})

describe('cancelScheduledBot', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw MeetingBaasError for invalid bot ID', async () => {
        await expect(cancelScheduledBot('invalid'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should return cancelled: true for valid bot ID', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse({})

        const result = await cancelScheduledBot(validId)
        expect(result.cancelled).toBe(true)
    })
})

describe('retryTranscription', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw MeetingBaasError for invalid bot ID', async () => {
        await expect(retryTranscription('invalid'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should return success: true for valid bot ID', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse({})

        const result = await retryTranscription(validId)
        expect(result.success).toBe(true)
    })
})

// ============================================
// Calendar Function Tests
// ============================================

describe('listCalendars', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should return array of calendars', async () => {
        const mockCalendars = [
            { calendar_id: 'cal-1', account_email: 'test@example.com' },
        ]
        mockSuccessResponse(mockCalendars)

        const result = await listCalendars()
        expect(result).toHaveLength(1)
        expect(result[0].calendar_id).toBe('cal-1')
    })
})

describe('listCalendarEvents', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw MeetingBaasError for invalid calendar ID', async () => {
        await expect(listCalendarEvents('invalid'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should return events for valid calendar ID', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        const mockEvents = [
            { event_id: 'event-1', title: 'Meeting' },
        ]
        mockSuccessResponse(mockEvents)

        const result = await listCalendarEvents(validId)
        expect(result).toHaveLength(1)
    })

    it('should include date params in query string', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse([])

        await listCalendarEvents(validId, {
            startDate: '2025-01-20',
            endDate: '2025-01-27',
        })

        // Check that fetch was called with query params
        const fetchCall = mockFetch.mock.calls[0]
        expect(fetchCall[0]).toContain('start_date=')
        expect(fetchCall[0]).toContain('end_date=')
    })
})

describe('deleteCalendar', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw MeetingBaasError for invalid calendar ID', async () => {
        await expect(deleteCalendar('invalid'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should complete successfully for valid calendar ID', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse({})

        await expect(deleteCalendar(validId)).resolves.toBeUndefined()
    })
})

// ============================================
// Edge Case Tests
// ============================================

describe('Edge Cases', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    describe('UUID validation edge cases', () => {
        it('should validate UUIDs with all zeros', async () => {
            const zeroUuid = '00000000-0000-0000-0000-000000000000'
            mockSuccessResponse({ bot_id: zeroUuid, status: 'completed' })

            const result = await getBotStatus(zeroUuid)
            expect(result.bot_id).toBe(zeroUuid)
        })

        it('should validate UUIDs with all Fs', async () => {
            const maxUuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
            mockSuccessResponse({ bot_id: maxUuid, status: 'completed' })

            const result = await getBotStatus(maxUuid)
            expect(result.bot_id).toBe(maxUuid)
        })
    })

    describe('Calendar date handling', () => {
        it('should convert date-only to full ISO datetime', async () => {
            const validId = '123e4567-e89b-12d3-a456-426614174000'
            mockSuccessResponse([])

            await listCalendarEvents(validId, { startDate: '2025-01-20' })

            const fetchCall = mockFetch.mock.calls[0]
            // URL encodes : as %3A
            expect(fetchCall[0]).toContain('2025-01-20T00%3A00%3A00Z')
        })

        it('should preserve full ISO datetime as-is', async () => {
            const validId = '123e4567-e89b-12d3-a456-426614174000'
            mockSuccessResponse([])

            await listCalendarEvents(validId, { startDate: '2025-01-20T14:30:00Z' })

            const fetchCall = mockFetch.mock.calls[0]
            // URL encodes : as %3A
            expect(fetchCall[0]).toContain('2025-01-20T14%3A30%3A00Z')
        })
    })

    describe('Empty responses', () => {
        it('should handle empty bot list', async () => {
            mockSuccessResponse([])
            const result = await listBots()
            expect(result).toEqual([])
        })

        it('should handle empty calendar list', async () => {
            mockSuccessResponse([])
            const result = await listCalendars()
            expect(result).toEqual([])
        })
    })
})

// ============================================
// Type Safety Tests
// ============================================

describe('Type Safety', () => {
    it('should return correct types for getBotStatus', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse({
            bot_id: validId,
            bot_name: 'Test',
            status: 'completed',
            created_at: '2025-01-20T10:00:00Z',
            duration_seconds: 3600,
            participants: [],
            speakers: [],
        })

        const result = await getBotStatus(validId)

        // TypeScript should infer these properties
        expect(typeof result.bot_id).toBe('string')
        expect(typeof result.status).toBe('string')
        expect(typeof result.created_at).toBe('string')
    })

    it('should return correct types for listCalendarEvents', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000'
        mockSuccessResponse([{
            event_id: 'event-1',
            series_id: 'series-1',
            event_type: 'one_off',
            title: 'Test Meeting',
            start_time: '2025-01-20T10:00:00Z',
            end_time: '2025-01-20T11:00:00Z',
            status: 'confirmed',
            meeting_url: 'https://meet.google.com/abc-defg-hij',
            calendar_id: validId,
            created_at: '2025-01-15T10:00:00Z',
        }])

        const result = await listCalendarEvents(validId)

        expect(result[0].event_id).toBe('event-1')
        expect(result[0].event_type).toBe('one_off')
        expect(result[0].title).toBe('Test Meeting')
    })
})

// ============================================
// getTranscript Tests
// ============================================

import { getTranscript, createMeetingBot, listRawCalendars, createCalendarConnection, scheduleCalendarBot } from '../meetingbaas'

describe('getTranscript', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should extract utterances from nested result structure', async () => {
        const mockUtterances = [
            { speaker: 0, text: 'Hello', start: 0, end: 1 },
            { speaker: 1, text: 'Hi there', start: 1, end: 2 },
        ]
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ result: { utterances: mockUtterances } }),
        })

        const result = await getTranscript('https://example.com/transcript.json')
        expect(result).toEqual(mockUtterances)
    })

    it('should handle direct array response', async () => {
        const mockUtterances = [
            { speaker: 0, text: 'Test', start: 0, end: 1 },
        ]
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockUtterances,
        })

        const result = await getTranscript('https://example.com/transcript.json')
        expect(result).toEqual(mockUtterances)
    })

    it('should handle utterances property at top level', async () => {
        const mockUtterances = [
            { speaker: 0, text: 'Test', start: 0, end: 1 },
        ]
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ utterances: mockUtterances }),
        })

        const result = await getTranscript('https://example.com/transcript.json')
        expect(result).toEqual(mockUtterances)
    })

    it('should return empty array for unknown format', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ unknown: 'format' }),
        })

        const result = await getTranscript('https://example.com/transcript.json')
        expect(result).toEqual([])
    })

    it('should throw on failed fetch', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found',
        })

        await expect(getTranscript('https://example.com/transcript.json'))
            .rejects
            .toThrow('Failed to fetch transcript')
    })
})

// ============================================
// createMeetingBot Tests
// ============================================

describe('createMeetingBot', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw for invalid meeting URL', async () => {
        await expect(createMeetingBot({
            meeting_url: 'invalid-url',
            bot_name: 'Test Bot',
        })).rejects.toThrow(MeetingBaasError)
    })

    it('should throw for empty bot name', async () => {
        await expect(createMeetingBot({
            meeting_url: 'https://meet.google.com/abc-defg-hij',
            bot_name: '',
        })).rejects.toThrow(MeetingBaasError)
    })

    it('should throw for whitespace-only bot name', async () => {
        await expect(createMeetingBot({
            meeting_url: 'https://meet.google.com/abc-defg-hij',
            bot_name: '   ',
        })).rejects.toThrow('Bot name is required')
    })

    it('should create bot with valid parameters', async () => {
        // Mock getBotStatus response
        mockSuccessResponse({
            bot_id: '12345678-1234-5678-90ab-cdef12345678',
            status: 'queued',
            created_at: '2025-01-20T10:00:00Z',
            bot_name: 'Test Bot',
            participants: [],
            speakers: [],
        })

        const result = await createMeetingBot({
            meeting_url: 'https://meet.google.com/abc-defg-hij',
            bot_name: 'Test Bot',
            user_id: 'user-123',
        })

        expect(result.bot_id).toBe('12345678-1234-5678-90ab-cdef12345678')
        expect(result.status).toBeDefined()
    })
})

// ============================================
// Calendar API Tests
// ============================================

describe('listRawCalendars', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should return array from calendars property', async () => {
        const mockCalendars = [
            { id: 'cal-1', name: 'Primary', email: 'user@gmail.com' },
            { id: 'cal-2', name: 'Work', email: 'user@work.com' },
        ]
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: { calendars: mockCalendars } }),
        })

        const result = await listRawCalendars({
            oauthClientId: 'client-id',
            oauthClientSecret: 'client-secret',
            oauthRefreshToken: 'refresh-token',
            platform: 'google',
        })

        expect(result).toEqual(mockCalendars)
    })

    it('should return array when response is direct array', async () => {
        const mockCalendars = [
            { id: 'cal-1', name: 'Primary', email: 'user@gmail.com' },
        ]
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: mockCalendars }),
        })

        const result = await listRawCalendars({
            oauthClientId: 'client-id',
            oauthClientSecret: 'client-secret',
            oauthRefreshToken: 'refresh-token',
            platform: 'google',
        })

        expect(result).toEqual(mockCalendars)
    })
})

describe('scheduleCalendarBot', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('should throw for invalid calendar ID', async () => {
        await expect(scheduleCalendarBot('invalid-id', 'event-123'))
            .rejects
            .toThrow(MeetingBaasError)
    })

    it('should schedule bot with valid parameters', async () => {
        const calendarId = '123e4567-e89b-12d3-a456-426614174000'
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: { event_id: 'event-123', scheduled: true } }),
        })

        const result = await scheduleCalendarBot(calendarId, 'event-123', {
            userId: 'user-456',
            allOccurrences: true,
        })

        expect(result.event_id).toBe('event-123')
    })

    it('should extract bot_id from response if present', async () => {
        const calendarId = '123e4567-e89b-12d3-a456-426614174000'
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: { bot_id: 'bot-789', event_id: 'event-123' } }),
        })

        const result = await scheduleCalendarBot(calendarId, 'event-123')

        expect(result.bot_id).toBe('bot-789')
    })

    it('should extract bot_id from scheduled_recording.id', async () => {
        const calendarId = '123e4567-e89b-12d3-a456-426614174000'
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    event_id: 'event-123',
                    scheduled_recording: { id: 'scheduled-bot-id' }
                }
            }),
        })

        const result = await scheduleCalendarBot(calendarId, 'event-123')

        expect(result.bot_id).toBe('scheduled-bot-id')
    })
})
