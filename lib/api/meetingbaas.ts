/**
 * MeetingBaas API v2 Client
 * 
 * Full implementation of MeetingBaas API endpoints with:
 * - Rate limiting with exponential backoff
 * - Input validation
 * - Comprehensive error handling
 * - Callback/webhook support
 * - Gladia transcription with summarization
 */

import { createBaasClient } from "@meeting-baas/sdk"
import type {
  CreateBotRequest,
  CreateBotResponse,
  Meeting,
  TranscriptUtterance,
} from "@/lib/data/types"
import {
  MEETINGBAAS_CONFIG,
  apiGet,
  apiPost,
  apiDelete,
  validateMeetingUrl,
  validateBotId,
  validateCalendarId,
  validateTimestamp,
  getCallbackConfig,
  getTranscriptionConfig,
  MeetingBaasError,
} from "./meetingbaas-utils"

// Re-export utilities for convenience
export { MeetingBaasError, validateMeetingUrl, validateBotId }

// SDK client for bot creation (uses official SDK)
const client = createBaasClient({
  api_key: MEETINGBAAS_CONFIG.apiKey,
  api_version: "v2",
})

// ============================================
// Bot Management Functions
// ============================================

/**
 * Create an immediate bot that joins a meeting now
 * @throws {MeetingBaasError} If validation fails or API returns error
 */
export async function createMeetingBot(
  config: CreateBotRequest & { user_id?: string }
): Promise<CreateBotResponse> {
  // Validate meeting URL
  const urlValidation = validateMeetingUrl(config.meeting_url)
  if (!urlValidation.valid) {
    throw new MeetingBaasError(urlValidation.error!, "INVALID_MEETING_URL", 400)
  }

  // Validate bot name
  if (!config.bot_name || config.bot_name.trim().length === 0) {
    throw new MeetingBaasError("Bot name is required", "VALIDATION_ERROR", 400)
  }

  // Build bot configuration
  const botConfig: Record<string, unknown> = {
    bot_name: config.bot_name.trim(),
    meeting_url: config.meeting_url.trim(),
    recording_mode: config.recording_mode || "speaker_view",
    allow_multiple_bots: config.allow_multiple_bots ?? false, // Prevent duplicate bots
    ...getTranscriptionConfig(),
  }

  // Add optional entry message
  if (config.entry_message) {
    botConfig.entry_message = config.entry_message
  }

  // Add timeout config - default to 300 seconds (5 min) for all timeouts
  botConfig.timeout_config = {
    waiting_room_timeout: config.timeout_config?.waiting_room_timeout ?? 300,
    no_one_joined_timeout: config.timeout_config?.no_one_joined_timeout ?? 300,
    silence_timeout: config.timeout_config?.silence_timeout ?? 300,
  }

  // Add callback config if configured
  const callbackConfig = getCallbackConfig()
  if (callbackConfig) {
    Object.assign(botConfig, callbackConfig)
  }

  // IMPORTANT: Pass user_id in extra for webhook to associate with correct user
  if (config.user_id) {
    botConfig.extra = {
      user_id: config.user_id,
      bot_name: config.bot_name.trim(),
      meeting_url: config.meeting_url.trim(),
    }
  }

  // Create bot via SDK
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await client.createBot(botConfig as any)

  if (!response.success) {
    throw new MeetingBaasError(
      response.error || "Failed to create bot",
      "BOT_CREATION_FAILED",
      500
    )
  }

  const botId = response.data.bot_id
  const botStatus = await getBotStatus(botId)

  return {
    bot_id: botId,
    status: botStatus.status,
    created_at: botStatus.created_at,
  }
}

/**
 * Get bot status and details by ID
 * @throws {MeetingBaasError} If bot ID is invalid or not found
 */
export async function getBotStatus(botId: string): Promise<Meeting> {
  if (!validateBotId(botId)) {
    throw new MeetingBaasError("Invalid bot ID format", "VALIDATION_ERROR", 400)
  }

  return apiGet<Meeting>(`/bots/${botId}`)
}

export async function getTranscript(
  transcriptUrl: string
): Promise<TranscriptUtterance[]> {
  const response = await fetch(transcriptUrl, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.statusText}`)
  }

  const data = await response.json()

  // Handle nested structure: { result: { utterances: [...] } }
  if (data.result?.utterances) {
    return data.result.utterances
  }

  if (Array.isArray(data)) {
    return data
  }

  if (data.utterances) {
    return data.utterances
  }

  return []
}

/**
 * List all bots for this account
 */
export async function listBots(): Promise<Meeting[]> {
  return apiGet<Meeting[]>("/bots")
}

/**
 * Leave a meeting - instructs the bot to stop recording and exit
 * Can only be called when bot status is: joining_call, in_waiting_room,
 * in_call_not_recording, in_call_recording, recording_paused, recording_resumed
 */
export async function leaveMeeting(botId: string): Promise<{ message: string }> {
  if (!validateBotId(botId)) {
    throw new MeetingBaasError("Invalid bot ID format", "VALIDATION_ERROR", 400)
  }

  return apiPost<{ message: string }>(`/bots/${botId}/leave`)
}

/**
 * Delete bot data permanently - removes recordings, transcriptions, screenshots
 * Can only be called when bot status is: completed or failed
 */
export async function deleteBotData(botId: string): Promise<{ deleted: boolean }> {
  if (!validateBotId(botId)) {
    throw new MeetingBaasError("Invalid bot ID format", "VALIDATION_ERROR", 400)
  }

  await apiDelete(`/bots/${botId}/delete-data`)
  return { deleted: true }
}

/**
 * Create a scheduled bot that joins at a specific time
 * @throws {MeetingBaasError} If validation fails or API returns error
 */
export async function createScheduledBot(config: {
  meeting_url: string
  bot_name: string
  join_at: string  // ISO 8601 timestamp
  recording_mode?: "speaker_view" | "gallery_view" | "audio_only"
  allow_multiple_bots?: boolean
}): Promise<{ bot_id: string }> {
  // Validate inputs
  const urlValidation = validateMeetingUrl(config.meeting_url)
  if (!urlValidation.valid) {
    throw new MeetingBaasError(urlValidation.error!, "INVALID_MEETING_URL", 400)
  }
  if (!validateTimestamp(config.join_at)) {
    throw new MeetingBaasError("Invalid join_at timestamp", "VALIDATION_ERROR", 400)
  }

  const body = {
    meeting_url: config.meeting_url.trim(),
    bot_name: config.bot_name.trim(),
    join_at: config.join_at,
    recording_mode: config.recording_mode || "speaker_view",
    allow_multiple_bots: config.allow_multiple_bots ?? false, // Prevent duplicate bots
    ...getTranscriptionConfig(),
    ...getCallbackConfig(),
  }

  return apiPost<{ bot_id: string }>("/bots/scheduled", body)
}

/**
 * Cancel a scheduled bot before it joins the meeting
 */
export async function cancelScheduledBot(botId: string): Promise<{ cancelled: boolean }> {
  if (!validateBotId(botId)) {
    throw new MeetingBaasError("Invalid bot ID format", "VALIDATION_ERROR", 400)
  }

  await apiDelete(`/bots/scheduled/${botId}`)
  return { cancelled: true }
}

/**
 * Retry transcription for a bot that failed transcription
 */
export async function retryTranscription(botId: string): Promise<{ success: boolean }> {
  if (!validateBotId(botId)) {
    throw new MeetingBaasError("Invalid bot ID format", "VALIDATION_ERROR", 400)
  }

  await apiPost(`/bots/${botId}/re-transcribe`)
  return { success: true }
}

// ============================================
// Error Codes - User-friendly messages
// ============================================

export const BOT_ERROR_MESSAGES: Record<string, { title: string; message: string; canRetry?: boolean }> = {
  // Normal end reasons
  BOT_REMOVED: { title: "Bot Removed", message: "The bot was removed from the meeting." },
  NO_ATTENDEES: { title: "No Attendees", message: "No one joined the meeting." },
  NO_SPEAKER: { title: "No Speaker", message: "No audio was detected during the recording." },
  RECORDING_TIMEOUT: { title: "Recording Timeout", message: "Recording timeout was reached." },
  API_REQUEST: { title: "Stopped by Request", message: "Recording was stopped via API request." },

  // Error end reasons
  BOT_NOT_ACCEPTED: { title: "Bot Not Accepted", message: "The meeting participants didn't admit the bot. Make sure to admit the bot when it appears." },
  TIMEOUT_WAITING_TO_START: { title: "Meeting Didn't Start", message: "No one joined the meeting within the timeout period." },
  CANNOT_JOIN_MEETING: { title: "Cannot Join Meeting", message: "The meeting is not reachable or may no longer exist." },
  BOT_REMOVED_TOO_EARLY: { title: "Recording Too Short", message: "The bot was removed before enough content was recorded." },
  INVALID_MEETING_URL: { title: "Invalid Meeting URL", message: "The meeting URL provided is not valid." },
  LOGIN_REQUIRED: { title: "Login Required", message: "The meeting requires login to access." },
  INTERNAL_ERROR: { title: "Internal Error", message: "An internal error occurred. Please try again." },

  // Transcription errors
  TRANSCRIPTION_FAILED: { title: "Transcription Failed", message: "The transcription process failed. You can retry.", canRetry: true },

  // System errors
  INSUFFICIENT_TOKENS: { title: "Insufficient Tokens", message: "Not enough tokens available. Please check your account balance." },
  DAILY_BOT_CAP_REACHED: { title: "Daily Limit Reached", message: "You've reached the daily bot creation limit." },
  BOT_ALREADY_EXISTS: { title: "Bot Already Exists", message: "A bot is already recording this meeting." },

  // Zoom-specific errors
  WAITING_FOR_HOST_TIMEOUT: { title: "Host Didn't Join", message: "The meeting host didn't join within the timeout period." },
  RECORDING_RIGHTS_NOT_GRANTED: { title: "Recording Permission Denied", message: "The host didn't grant recording permission to the bot." },

  // Unknown
  UNKNOWN_ERROR: { title: "Unknown Error", message: "An unexpected error occurred. Please contact support if this persists." },
}

/**
 * Get user-friendly error message for a bot error code
 */
export function getBotErrorMessage(errorCode: string | undefined): { title: string; message: string; canRetry?: boolean } {
  const fallback = { title: "Unknown Error", message: "An unexpected error occurred. Please contact support if this persists." }
  if (!errorCode) {
    return fallback
  }
  return BOT_ERROR_MESSAGES[errorCode] ?? fallback
}

// ============================================
// Calendar API Functions
// ============================================

export interface CalendarConnection {
  calendar_id: string
  calendar_platform: string
  account_email: string
  status: string
  synced_at: string
  created_at: string
}

export interface CalendarEvent {
  event_id: string
  series_id: string
  event_type: "one_off" | "recurring"
  title: string
  start_time: string
  end_time: string
  status: string
  is_exception?: boolean
  meeting_url: string | null
  meeting_platform?: "zoom" | "google_meet" | "teams" | null
  calendar_id: string
  bot_scheduled?: boolean
  created_at: string
}

// List raw calendars from OAuth credentials (needed to get raw_calendar_id)
export interface RawCalendar {
  id: string
  name: string
  email?: string
}

/**
 * List raw calendars from OAuth credentials (needed to get raw_calendar_id)
 */
export async function listRawCalendars(params: {
  oauthClientId: string
  oauthClientSecret: string
  oauthRefreshToken: string
  platform: "google" | "microsoft"
}): Promise<RawCalendar[]> {
  const result = await apiPost<RawCalendar[] | { calendars: RawCalendar[] }>("/calendars/list-raw", {
    calendar_platform: params.platform,
    oauth_client_id: params.oauthClientId,
    oauth_client_secret: params.oauthClientSecret,
    oauth_refresh_token: params.oauthRefreshToken,
  })

  // Handle different response formats
  return Array.isArray(result) ? result : (result as { calendars: RawCalendar[] })?.calendars || []
}

/**
 * Create a calendar connection in MeetingBaas
 */
export async function createCalendarConnection(params: {
  oauthClientId: string
  oauthClientSecret: string
  oauthRefreshToken: string
  platform: "google" | "microsoft"
  rawCalendarId?: string
}): Promise<CalendarConnection> {
  let rawCalendarId = params.rawCalendarId

  // If no raw_calendar_id provided, fetch the list of raw calendars first
  if (!rawCalendarId) {
    // Fetching raw calendars to find primary calendar
    const rawCalendars = await listRawCalendars({
      oauthClientId: params.oauthClientId,
      oauthClientSecret: params.oauthClientSecret,
      oauthRefreshToken: params.oauthRefreshToken,
      platform: params.platform,
    })

    if (rawCalendars.length === 0) {
      throw new MeetingBaasError("No calendars found for this account", "NO_CALENDARS_FOUND", 404)
    }

    // Use the first (primary) calendar
    const primaryCalendar = rawCalendars[0]!
    rawCalendarId = primaryCalendar.id
    // Using primary calendar

    // Wait 1.5 seconds to respect MeetingBaas rate limit (1 req/sec)
    await new Promise(resolve => setTimeout(resolve, 1500))
  }

  return apiPost<CalendarConnection>("/calendars", {
    calendar_platform: params.platform,
    oauth_client_id: params.oauthClientId,
    oauth_client_secret: params.oauthClientSecret,
    oauth_refresh_token: params.oauthRefreshToken,
    raw_calendar_id: rawCalendarId,
  })
}

/**
 * List all connected calendars
 */
export async function listCalendars(): Promise<CalendarConnection[]> {
  return apiGet<CalendarConnection[]>("/calendars")
}

/**
 * List events from a connected calendar
 */
export async function listCalendarEvents(
  calendarId: string,
  options?: {
    startDate?: string
    endDate?: string
    limit?: number
  }
): Promise<CalendarEvent[]> {
  if (!validateCalendarId(calendarId)) {
    throw new MeetingBaasError("Invalid calendar ID format", "VALIDATION_ERROR", 400)
  }

  const params = new URLSearchParams()
  // API expects full ISO datetime, not just date
  if (options?.startDate) {
    const startDateTime = options.startDate.includes('T')
      ? options.startDate
      : `${options.startDate}T00:00:00Z`
    params.append("start_date", startDateTime)
  }
  if (options?.endDate) {
    const endDateTime = options.endDate.includes('T')
      ? options.endDate
      : `${options.endDate}T23:59:59Z`
    params.append("end_date", endDateTime)
  }
  if (options?.limit) params.append("limit", options.limit.toString())

  const queryString = params.toString()
  return apiGet<CalendarEvent[]>(`/calendars/${calendarId}/events${queryString ? `?${queryString}` : ""}`)
}

/**
 * Schedule a bot for a calendar event
 */
export async function scheduleCalendarBot(
  calendarId: string,
  eventId: string,
  botConfig?: {
    botName?: string
    botImage?: string
    recordingMode?: "speaker_view" | "gallery_view" | "audio_only"
    allOccurrences?: boolean
    seriesId?: string
    userId?: string  // IMPORTANT: Pass user_id for webhook association
    timeoutConfig?: {
      waitingRoomTimeout?: number
      noOneJoinedTimeout?: number
    }
  }
): Promise<{ bot_id: string }> {
  if (!validateCalendarId(calendarId)) {
    throw new MeetingBaasError("Invalid calendar ID format", "VALIDATION_ERROR", 400)
  }

  const body: Record<string, unknown> = {
    // Include both event_id and series_id - MeetingBaas requires both
    event_id: eventId,
    ...(botConfig?.seriesId && { series_id: botConfig.seriesId }),
    all_occurrences: botConfig?.allOccurrences || false,
    bot_name: botConfig?.botName || "Potts Recorder",
    ...(botConfig?.botImage && { bot_image: botConfig.botImage }),
    recording_mode: botConfig?.recordingMode || "speaker_view",
    ...getTranscriptionConfig(),
  }

  // Add timeout config - default to 300 seconds (5 min) for all timeouts
  body.timeout_config = {
    waiting_room_timeout: botConfig?.timeoutConfig?.waitingRoomTimeout ?? 300,
    no_one_joined_timeout: botConfig?.timeoutConfig?.noOneJoinedTimeout ?? 300,
    silence_timeout: 300, // Leave after 5 min of silence
  }

  // Add callback config
  const callbackConfig = getCallbackConfig()
  if (callbackConfig) {
    Object.assign(body, callbackConfig)
  }

  // IMPORTANT: Always include calendar_id in extra for webhook user lookup
  // Even if userId is not available, the webhook can look up via calendar_id
  body.extra = {
    ...(botConfig?.userId && { user_id: botConfig.userId }),
    bot_name: botConfig?.botName || "Potts Recorder",
    calendar_id: calendarId,
    event_id: eventId,
  }

  // MeetingBaas may return different field names for bot_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await apiPost<any>(`/calendars/${calendarId}/bots`, body)

  // Log the full response for debugging
  console.log('[scheduleCalendarBot] API response:', JSON.stringify(response))

  // Handle different possible response formats:
  // - Direct: { bot_id: "..." }
  // - SDK format: { scheduled_recording: { id: "..." } }
  // - Nested: { data: { bot_id: "..." } }
  let botId: string | undefined
  if (response?.bot_id) {
    botId = response.bot_id
  } else if (response?.scheduled_recording?.id) {
    botId = response.scheduled_recording.id
  } else if (response?.data?.bot_id) {
    botId = response.data.bot_id
  } else if (response?.id) {
    botId = response.id
  } else if (typeof response === 'string') {
    // Sometimes APIs return just the ID as a string
    botId = response
  }

  if (!botId) {
    console.error('[scheduleCalendarBot] Could not find bot_id in response:', JSON.stringify(response))
    throw new MeetingBaasError(
      `Failed to get bot_id from response: ${JSON.stringify(response)}`,
      'INVALID_RESPONSE',
      500
    )
  }

  return { bot_id: botId }
}

/**
 * Delete a calendar connection
 */
export async function deleteCalendar(calendarId: string): Promise<void> {
  if (!validateCalendarId(calendarId)) {
    throw new MeetingBaasError("Invalid calendar ID format", "VALIDATION_ERROR", 400)
  }

  await apiDelete(`/calendars/${calendarId}`)
}

