import { createBaasClient } from "@meeting-baas/sdk"
import type {
  CreateBotRequest,
  CreateBotResponse,
  Meeting,
  TranscriptUtterance,
} from "@/lib/data/types"

const API_KEY = process.env.MEETINGBAAS_API_KEY || ""
const API_BASE_URL = "https://api.meetingbaas.com/v2"

const client = createBaasClient({
  api_key: API_KEY,
  api_version: "v2",
})

export async function createMeetingBot(
  config: CreateBotRequest
): Promise<CreateBotResponse> {
  const response = await client.createBot({
    bot_name: config.bot_name,
    meeting_url: config.meeting_url,
    recording_mode: config.recording_mode || "speaker_view",
    transcription_enabled: true,
    transcription_config: {
      provider: "gladia",
    },
    // TODO: Configure bot to join 30 seconds early (check SDK documentation)
  })

  if (!response.success) {
    throw new Error(response.error || "Failed to create bot")
  }

  const botId = response.data.bot_id

  const botStatus = await getBotStatus(botId)

  return {
    bot_id: botId,
    status: botStatus.status,
    created_at: botStatus.created_at,
  }
}

export async function getBotStatus(bot_id: string): Promise<Meeting> {
  const response = await fetch(`${API_BASE_URL}/bots/${bot_id}`, {
    headers: {
      "x-meeting-baas-api-key": API_KEY,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch bot status: ${response.statusText}`)
  }

  const data = await response.json()
  return data.data
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

  if (Array.isArray(data)) {
    return data
  }

  if (data.utterances) {
    return data.utterances
  }

  return []
}

export async function listBots(): Promise<Meeting[]> {
  const response = await fetch(`${API_BASE_URL}/bots`, {
    headers: {
      "x-meeting-baas-api-key": API_KEY,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to list bots: ${response.statusText}`)
  }

  const data = await response.json()
  return data.data || []
}

// ============================================
// Calendar API Functions
// ============================================

export interface CalendarConnection {
  uuid: string
  email: string
  name: string
  google_id: string
}

export interface CalendarEvent {
  event_id: string
  series_id: string
  event_type: "one_off" | "recurring"
  title: string
  start_time: string
  end_time: string
  meeting_url: string | null
  attendees: { email: string; name?: string | null }[]
  organizer: { email: string; name?: string | null }
  calendar_id: string
  status: string
  created_at: string
  bot_id?: string | null
}

// List raw calendars from OAuth credentials (needed to get raw_calendar_id)
export interface RawCalendar {
  id: string
  name: string
  email?: string
}

export async function listRawCalendars(params: {
  oauthClientId: string
  oauthClientSecret: string
  oauthRefreshToken: string
  platform: "Google" | "Microsoft"
}): Promise<RawCalendar[]> {
  const response = await fetch(`${API_BASE_URL}/calendars/list-raw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-meeting-baas-api-key": API_KEY,
    },
    body: JSON.stringify({
      platform: params.platform,
      oauth_client_id: params.oauthClientId,
      oauth_client_secret: params.oauthClientSecret,
      oauth_refresh_token: params.oauthRefreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list raw calendars: ${error}`)
  }

  const data = await response.json()
  return data.data || data.calendars || []
}

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
    console.log("No raw_calendar_id provided, fetching raw calendars...")
    const rawCalendars = await listRawCalendars({
      oauthClientId: params.oauthClientId,
      oauthClientSecret: params.oauthClientSecret,
      oauthRefreshToken: params.oauthRefreshToken,
      platform: params.platform === "google" ? "Google" : "Microsoft",
    })

    if (rawCalendars.length === 0) {
      throw new Error("No calendars found for this account")
    }

    // Use the first (primary) calendar
    const primaryCalendar = rawCalendars[0]!
    rawCalendarId = primaryCalendar.id
    console.log("Using raw calendar:", rawCalendarId, primaryCalendar.name)
  }

  const response = await fetch(`${API_BASE_URL}/calendars`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-meeting-baas-api-key": API_KEY,
    },
    body: JSON.stringify({
      calendar_platform: params.platform,
      oauth_client_id: params.oauthClientId,
      oauth_client_secret: params.oauthClientSecret,
      oauth_refresh_token: params.oauthRefreshToken,
      raw_calendar_id: rawCalendarId,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create calendar connection: ${error}`)
  }

  const data = await response.json()
  return data.data || data.calendar
}

export async function listCalendars(): Promise<CalendarConnection[]> {
  const response = await fetch(`${API_BASE_URL}/calendars`, {
    headers: {
      "x-meeting-baas-api-key": API_KEY,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to list calendars: ${response.statusText}`)
  }

  const data = await response.json()
  return data.data || data || []
}

export async function listCalendarEvents(
  calendarId: string,
  options?: {
    startDate?: string
    endDate?: string
    limit?: number
  }
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams()
  if (options?.startDate) params.append("start_date", options.startDate)
  if (options?.endDate) params.append("end_date", options.endDate)
  if (options?.limit) params.append("limit", options.limit.toString())

  const url = `${API_BASE_URL}/calendars/${calendarId}/events${params.toString() ? `?${params}` : ""}`

  const response = await fetch(url, {
    headers: {
      "x-meeting-baas-api-key": API_KEY,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to list calendar events: ${response.statusText}`)
  }

  const data = await response.json()
  return data.data || []
}

export async function scheduleCalendarBot(
  calendarId: string,
  eventId: string,
  botConfig?: {
    botName?: string
    botImage?: string
    recordingMode?: "speaker_view" | "gallery_view" | "audio_only"
  }
): Promise<{ bot_id: string }> {
  const response = await fetch(`${API_BASE_URL}/calendars/${calendarId}/bots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-meeting-baas-api-key": API_KEY,
    },
    body: JSON.stringify({
      event_id: eventId,
      bot_name: botConfig?.botName || "Potts Recorder",
      ...(botConfig?.botImage && { bot_image: botConfig.botImage }),
      recording_mode: botConfig?.recordingMode || "speaker_view",
      transcription_enabled: true,
      transcription_config: {
        provider: "gladia",
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to schedule calendar bot: ${error}`)
  }

  const data = await response.json()
  return data.data || data
}

export async function deleteCalendar(calendarId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/calendars/${calendarId}`, {
    method: "DELETE",
    headers: {
      "x-meeting-baas-api-key": API_KEY,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to delete calendar: ${response.statusText}`)
  }
}

