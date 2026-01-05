import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ensureUserExists } from "@/lib/utils/ensure-user"

const apiLogger = logger.child('api:bots:id')

/**
 * GET /api/bots/[id]
 *
 * Get meeting details by bot ID.
 * ONLY reads from Supabase - no MeetingBaas API fallback.
 * All data is stored locally by the webhook handler.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    await ensureUserExists(user)

    const { id } = await params

    // Fetch meeting from database - verify user owns this meeting
    const meeting = await prisma.meeting.findFirst({
      where: {
        botId: id,
        userId: user.id
      },
      include: {
        transcript: true,
        diarization: true,
        summary: true,
        actionItems: true,
        participants: true,
      }
    })

    if (!meeting) {
      apiLogger.info("Meeting not found", { bot_id: id, user_id: user.id })
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      )
    }

    apiLogger.info("Serving meeting from database", {
      bot_id: id,
      user_id: user.id,
      status: meeting.status,
      processing_status: meeting.processingStatus,
      has_transcript: !!meeting.transcript,
      has_summary: !!meeting.summary
    })

    // Build response with all local data
    const utterances = (meeting.transcript?.data as unknown[]) || []

    return NextResponse.json({
      // Meeting metadata
      id: meeting.id,
      bot_id: meeting.botId,
      bot_name: meeting.botName,
      meeting_url: meeting.meetingUrl,
      status: meeting.status,
      processing_status: meeting.processingStatus,
      recording_mode: meeting.recordingMode,
      duration_seconds: meeting.durationSeconds,
      participant_count: meeting.participantCount,
      created_at: meeting.createdAt.toISOString(),
      completed_at: meeting.completedAt?.toISOString(),
      // Error info if failed
      error_code: meeting.errorCode,
      error_message: meeting.errorMessage,
      // Legacy URLs (may be expired, kept for backwards compatibility)
      video: meeting.videoUrl,
      audio: meeting.audioUrl,
      // Content (stored locally, never expires)
      utterances,
      transcript_raw: meeting.transcript?.rawData,
      diarization: meeting.diarization?.data,
      summary: meeting.summary ? {
        overview: meeting.summary.overview,
        keyPoints: meeting.summary.keyPoints,
        decisions: meeting.summary.decisions,
        nextSteps: meeting.summary.nextSteps,
      } : null,
      actionItems: meeting.actionItems.map(item => ({
        id: item.id,
        description: item.description,
        assignee: item.assignee,
        dueDate: item.dueDate,
        completed: item.completed,
      })),
      participants: meeting.participants.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        joinedAt: p.joinedAt?.toISOString(),
        leftAt: p.leftAt?.toISOString(),
      })),
    })
  } catch (error) {
    apiLogger.error("Failed to fetch meeting", error instanceof Error ? error : undefined, {
      bot_id: (await params).id
    })
    return NextResponse.json(
      { error: "Failed to fetch meeting" },
      { status: 500 }
    )
  }
}
