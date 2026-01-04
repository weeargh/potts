// Bot status codes per MeetingBaas API v2 documentation
export type BotStatus =
  | "queued"
  | "joining_call"
  | "in_waiting_room"
  | "in_call_not_recording"
  | "in_call_recording"
  | "recording_paused"
  | "recording_resumed"
  | "transcribing"
  | "completed"
  | "failed"

export interface Participant {
  id: string
  name: string
  events: Array<{
    type: string
    timestamp: string
  }>
}

export interface Speaker {
  id: string
  name: string
}

export interface TranscriptWord {
  text: string
  start: number
  end: number
  confidence: number
}

export interface TranscriptUtterance {
  speaker: number | string
  text: string
  words: TranscriptWord[]
  start?: number
  end?: number
  confidence?: number
}

export interface AISummary {
  overview: string
  keyPoints: string[]
  decisions: string[]
  nextSteps: string[]
}

export interface ActionItem {
  id: string
  description: string
  assignee?: string
  dueDate?: string
  completed: boolean
}

export interface Meeting {
  bot_id: string
  bot_name: string
  meeting_url: string
  status: BotStatus
  created_at: string
  updated_at?: string
  duration_seconds: number | null
  participants: Participant[]
  speakers: Speaker[]
  transcription?: string
  video?: string
  audio?: string
  diarization?: string
  error_code?: string
  error_message?: string
  summary?: AISummary
  actionItems?: ActionItem[]
}

export interface CreateBotRequest {
  meeting_url: string
  bot_name: string
  recording_mode?: "speaker_view" | "gallery_view" | "audio_only"
  allow_multiple_bots?: boolean  // Default true, set false to prevent duplicates
  entry_message?: string  // Message bot sends when joining
  timeout_config?: {
    waiting_room_timeout?: number  // 120-1800 seconds
    no_one_joined_timeout?: number  // 120-1800 seconds
    silence_timeout?: number  // 300-1800 seconds
  }
}

export interface CreateBotResponse {
  bot_id: string
  status: BotStatus
  created_at: string
}
