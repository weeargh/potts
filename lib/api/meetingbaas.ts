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
