export type BotStatus =
  | "queued"
  | "in_waiting_room"
  | "in_meeting"
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
  duration_seconds: number | null
  participants: Participant[]
  speakers: Speaker[]
  transcription?: string
  video?: string
  audio?: string
  summary?: AISummary
  actionItems?: ActionItem[]
}

export interface CreateBotRequest {
  meeting_url: string
  bot_name: string
  recording_mode?: "speaker_view" | "gallery_view" | "audio_only"
}

export interface CreateBotResponse {
  bot_id: string
  status: BotStatus
  created_at: string
}
