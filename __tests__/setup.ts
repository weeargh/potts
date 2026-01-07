/**
 * Global Test Setup
 * 
 * Sets up mocks for Prisma, Supabase, and fetch.
 * Imported automatically via vitest.config.ts setupFiles.
 */

import { vi, beforeEach } from 'vitest'

// ============================================
// Prisma Mock
// ============================================

export const mockPrisma = {
    user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    },
    calendarAccount: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    meeting: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    transcript: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    },
    diarization: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    },
    summary: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    },
    actionItem: {
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    participant: {
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    calendarEvent: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
}

vi.mock('@/lib/prisma', () => ({
    prisma: mockPrisma,
}))

// ============================================
// Supabase Mock
// ============================================

export const mockSupabaseUser = {
    id: 'test-user-uuid-1234-5678-90abcdef1234',
    email: 'test@example.com',
    user_metadata: {
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
    },
}

export const mockSupabase = {
    auth: {
        getUser: vi.fn().mockResolvedValue({
            data: { user: mockSupabaseUser },
            error: null,
        }),
        getSession: vi.fn().mockResolvedValue({
            data: { session: { user: mockSupabaseUser } },
            error: null,
        }),
    },
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

// ============================================
// ensure-user Mock
// ============================================

vi.mock('@/lib/utils/ensure-user', () => ({
    ensureUserExists: vi.fn().mockResolvedValue(undefined),
}))

// ============================================
// Fetch Mock (Global)
// ============================================

export const mockFetch = vi.fn()
global.fetch = mockFetch

// ============================================
// Reset Mocks Before Each Test
// ============================================

beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
})

// ============================================
// Test Helpers
// ============================================

/**
 * Create a mock NextRequest
 */
export function createMockRequest(
    url: string,
    options: {
        method?: string
        body?: unknown
        headers?: Record<string, string>
    } = {}
) {
    const { method = 'GET', body, headers = {} } = options

    return {
        url,
        method,
        headers: new Map(Object.entries(headers)),
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
        nextUrl: new URL(url, 'http://localhost:3000'),
    } as unknown as Request
}

/**
 * Create a mock Response from MeetingBaas API
 */
export function mockApiResponse<T>(data: T, status = 200) {
    mockFetch.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ data }),
        text: async () => JSON.stringify({ data }),
    })
}

/**
 * Create test meeting data
 */
export function createTestMeeting(overrides = {}) {
    return {
        id: 'meeting-uuid-1234-5678-90abcdef1234',
        userId: mockSupabaseUser.id,
        botId: 'bot-uuid-1234-5678-90abcdef1234',
        botName: 'Notula - AI Notetaker',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        status: 'completed',
        processingStatus: 'completed',
        createdAt: new Date('2025-01-20T10:00:00Z'),
        updatedAt: new Date('2025-01-20T11:00:00Z'),
        ...overrides,
    }
}

/**
 * Create test transcript utterances
 */
export function createTestUtterances() {
    return [
        { speaker: 0, text: 'Hello everyone', start: 0, end: 1.5 },
        { speaker: 1, text: 'Hi, thanks for joining', start: 2, end: 4 },
        { speaker: 0, text: 'Let\'s discuss the project', start: 5, end: 7 },
    ]
}
