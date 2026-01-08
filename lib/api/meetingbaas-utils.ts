/**
 * MeetingBaas API v2 Utilities
 * Reusable helpers for API calls, validation, and rate limiting
 */

// ============================================
// Configuration
// ============================================

export const MEETINGBAAS_CONFIG = {
    apiKey: process.env.MEETINGBAAS_API_KEY || "",
    baseUrl: "https://api.meetingbaas.com/v2",
    callbackUrl: process.env.MEETINGBAAS_CALLBACK_URL || "",
    callbackSecret: process.env.MEETINGBAAS_CALLBACK_SECRET || "",
    defaultTimeout: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 1000, // 1 second base delay
}

/**
 * Bot avatar URL - publicly accessible image for bot profile
 * Uses VERCEL_URL in production, falls back to localhost for dev
 */
const getBaseUrl = () => {
    if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    return 'http://localhost:3000'
}

export const BOT_AVATAR_URL = `${getBaseUrl()}/bot-avatar.png`

// ============================================
// Types
// ============================================

export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
    code?: string
}

export interface FetchOptions extends RequestInit {
    timeout?: number
    retries?: number
}

export class MeetingBaasError extends Error {
    code: string
    statusCode: number
    retryAfter?: number

    constructor(message: string, code: string, statusCode: number, retryAfter?: number) {
        super(message)
        this.name = "MeetingBaasError"
        this.code = code
        this.statusCode = statusCode
        this.retryAfter = retryAfter
    }
}

// ============================================
// Validation Utilities
// ============================================

/**
 * Validate a meeting URL format
 */
export function validateMeetingUrl(url: string): { valid: boolean; platform?: string; error?: string } {
    if (!url || typeof url !== "string") {
        return { valid: false, error: "Meeting URL is required" }
    }

    const trimmed = url.trim()

    // Google Meet
    if (/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(trimmed)) {
        return { valid: true, platform: "google_meet" }
    }

    // Zoom
    if (/^https:\/\/([\w-]+\.)?zoom\.us\/j\/\d+/.test(trimmed)) {
        return { valid: true, platform: "zoom" }
    }

    // Microsoft Teams
    if (/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\//.test(trimmed)) {
        return { valid: true, platform: "teams" }
    }

    // Webex
    if (/^https:\/\/[\w-]+\.webex\.com\//.test(trimmed)) {
        return { valid: true, platform: "webex" }
    }

    return { valid: false, error: "Invalid or unsupported meeting URL format" }
}

/**
 * Validate bot ID format (UUID)
 */
export function validateBotId(botId: string): boolean {
    if (!botId || typeof botId !== "string") return false
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botId)
}

/**
 * Validate calendar ID format (UUID)
 */
export function validateCalendarId(calendarId: string): boolean {
    return validateBotId(calendarId) // Same format
}

/**
 * Validate ISO 8601 timestamp
 */
export function validateTimestamp(timestamp: string): boolean {
    if (!timestamp || typeof timestamp !== "string") return false
    const date = new Date(timestamp)
    return !isNaN(date.getTime())
}

// ============================================
// Rate Limiting & Retry Logic
// ============================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(attempt: number, baseDelay: number = 1000): number {
    return Math.min(baseDelay * Math.pow(2, attempt), 30000) // Max 30 seconds
}

/**
 * Fetch with retry logic and rate limit handling
 */
export async function fetchWithRetry<T>(
    url: string,
    options: FetchOptions = {}
): Promise<T> {
    const {
        timeout = MEETINGBAAS_CONFIG.defaultTimeout,
        retries = MEETINGBAAS_CONFIG.maxRetries,
        ...fetchOptions
    } = options

    // Add API key header
    const headers = new Headers(fetchOptions.headers)
    if (!headers.has("x-meeting-baas-api-key")) {
        headers.set("x-meeting-baas-api-key", MEETINGBAAS_CONFIG.apiKey)
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Create abort controller for timeout
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), timeout)

            const response = await fetch(url, {
                ...fetchOptions,
                headers,
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            // Handle rate limiting (429)
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get("retry-after") || "1", 10)
                if (attempt < retries) {
                    console.warn(`Rate limited, retrying after ${retryAfter}s (attempt ${attempt + 1}/${retries})`)
                    await sleep(retryAfter * 1000)
                    continue
                }
                throw new MeetingBaasError(
                    "Rate limit exceeded",
                    "FST_ERR_TOO_MANY_REQUESTS",
                    429,
                    retryAfter
                )
            }

            // Handle other errors
            if (!response.ok) {
                const errorBody = await response.text()
                let errorData: { error?: string; code?: string; message?: string } = {}
                try {
                    errorData = JSON.parse(errorBody)
                } catch {
                    errorData = { error: errorBody }
                }

                throw new MeetingBaasError(
                    errorData.message || errorData.error || response.statusText,
                    errorData.code || `HTTP_${response.status}`,
                    response.status
                )
            }

            // Parse successful response
            const data = await response.json()
            return data.data !== undefined ? data.data : data
        } catch (error) {
            lastError = error as Error

            // Don't retry on validation or client errors (4xx except 429)
            if (error instanceof MeetingBaasError && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
                throw error
            }

            // Retry on network errors or server errors
            if (attempt < retries) {
                const delay = getRetryDelay(attempt, MEETINGBAAS_CONFIG.retryDelay)
                console.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`)
                await sleep(delay)
            }
        }
    }

    throw lastError || new Error("Request failed after retries")
}

// ============================================
// API Helper Functions
// ============================================

/**
 * Make a GET request to MeetingBaas API
 */
export async function apiGet<T>(endpoint: string, options?: FetchOptions): Promise<T> {
    return fetchWithRetry<T>(`${MEETINGBAAS_CONFIG.baseUrl}${endpoint}`, {
        method: "GET",
        cache: "no-store",
        ...options,
    })
}

/**
 * Make a POST request to MeetingBaas API
 */
export async function apiPost<T>(endpoint: string, body?: unknown, options?: FetchOptions): Promise<T> {
    const headers = new Headers(options?.headers)
    if (body) {
        headers.set("Content-Type", "application/json")
    }

    return fetchWithRetry<T>(`${MEETINGBAAS_CONFIG.baseUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        ...options,
    })
}

/**
 * Make a DELETE request to MeetingBaas API
 */
export async function apiDelete<T>(endpoint: string, options?: FetchOptions): Promise<T> {
    return fetchWithRetry<T>(`${MEETINGBAAS_CONFIG.baseUrl}${endpoint}`, {
        method: "DELETE",
        ...options,
    })
}

/**
 * Get callback config if configured
 */
export function getCallbackConfig(): Record<string, unknown> | null {
    if (!MEETINGBAAS_CONFIG.callbackUrl) return null

    return {
        callback_enabled: true,
        callback_config: {
            url: MEETINGBAAS_CONFIG.callbackUrl,
            method: "POST",
            ...(MEETINGBAAS_CONFIG.callbackSecret && { secret: MEETINGBAAS_CONFIG.callbackSecret })
        }
    }
}

/**
 * Get default transcription config with summarization
 * 
 * According to MeetingBaas API docs:
 * - custom_vocabulary: Array of strings for domain-specific terms
 * - custom_vocabulary_config: Advanced config with intensity/pronunciations
 * 
 * @param options.summarizationType - Type of summarization (general, bullet_points, concise)
 * @param options.customVocabulary - Array of custom vocabulary terms for improved accuracy
 */
export function getTranscriptionConfig(options?: {
    summarizationType?: "general" | "bullet_points" | "concise"
    customVocabulary?: string[]
}) {
    const customParams: Record<string, unknown> = {
        summarization: true,
        summarization_config: {
            type: options?.summarizationType || "bullet_points"
        }
    }

    // Add custom vocabulary if provided
    // MeetingBaas/Gladia uses this to improve recognition of domain-specific terms
    if (options?.customVocabulary && options.customVocabulary.length > 0) {
        customParams.custom_vocabulary = options.customVocabulary
    }

    return {
        transcription_enabled: true,
        transcription_config: {
            provider: "gladia",
            custom_params: customParams
        }
    }
}
