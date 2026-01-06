import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { getBotStatus, getTranscript } from "@/lib/api/meetingbaas"
import { generateMeetingAIContent } from "@/lib/ai/generate"
import { logger } from "@/lib/logger"
import { ensureUserExists } from "@/lib/utils/ensure-user"

const apiLogger = logger.child('api:bots:recover')

/**
 * POST /api/bots/[id]/recover
 *
 * Manually recover a meeting by fetching it from MeetingBaas API.
 * Use this when a webhook was missed or rejected.
 */
export async function POST(
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

    const { id: botId } = await params

    apiLogger.info("Attempting to recover meeting", { bot_id: botId, user_id: user.id })

    // Check if meeting already exists
    const existingMeeting = await prisma.meeting.findUnique({
      where: { botId }
    })

    if (existingMeeting) {
      // If exists but belongs to different user, reject
      if (existingMeeting.userId !== user.id) {
        return NextResponse.json(
          { error: "Meeting belongs to another user" },
          { status: 403 }
        )
      }

      // If already completed with transcript, no need to recover
      if (existingMeeting.processingStatus === "completed") {
        return NextResponse.json({
          message: "Meeting already processed",
          meeting_id: existingMeeting.id,
          status: existingMeeting.status
        })
      }
    }

    // Fetch bot details from MeetingBaas
    let botDetails
    try {
      botDetails = await getBotStatus(botId)
    } catch (err) {
      apiLogger.error("Failed to fetch bot from MeetingBaas", err instanceof Error ? err : undefined, { bot_id: botId })
      return NextResponse.json(
        { error: "Bot not found on MeetingBaas" },
        { status: 404 }
      )
    }

    // Create or update meeting record
    const meeting = await prisma.meeting.upsert({
      where: { botId },
      update: {
        status: botDetails.status || "completed",
        processingStatus: "processing",
        durationSeconds: botDetails.duration_seconds,
      },
      create: {
        userId: user.id,
        botId,
        botName: botDetails.bot_name || "Recovered Meeting",
        meetingUrl: botDetails.meeting_url || "",
        status: botDetails.status || "completed",
        processingStatus: "processing",
        durationSeconds: botDetails.duration_seconds,
        extra: { recovered: true, recovered_at: new Date().toISOString() },
      }
    })

    apiLogger.info("Meeting record created/updated", { meeting_id: meeting.id, bot_id: botId })

    // Download transcript if available
    let utterances: unknown[] = []
    if (botDetails.transcription) {
      try {
        apiLogger.info("Downloading transcript", { bot_id: botId, url: botDetails.transcription })
        utterances = await getTranscript(botDetails.transcription)

        // Also try raw transcription
        let rawData: unknown = null
        if (botDetails.raw_transcription) {
          try {
            const rawResponse = await fetch(botDetails.raw_transcription, { cache: "no-store" })
            if (rawResponse.ok) {
              rawData = await rawResponse.json()
            }
          } catch {
            // Ignore raw transcript errors
          }
        }

        // Store transcript
        await prisma.transcript.upsert({
          where: { meetingId: meeting.id },
          update: { data: utterances as object, rawData: rawData as object },
          create: { meetingId: meeting.id, data: utterances as object, rawData: rawData as object }
        })

        apiLogger.info("Transcript saved", { bot_id: botId, utterance_count: utterances.length })
      } catch (err) {
        apiLogger.error("Failed to fetch transcript (URLs may have expired)", err instanceof Error ? err : undefined, { bot_id: botId })
      }
    }

    // Download diarization if available
    if (botDetails.diarization) {
      try {
        const diarizationResponse = await fetch(botDetails.diarization, { cache: "no-store" })
        if (diarizationResponse.ok) {
          const text = await diarizationResponse.text()
          const diarizationData = text
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
              try { return JSON.parse(line) } catch { return null }
            })
            .filter(Boolean)

          await prisma.diarization.upsert({
            where: { meetingId: meeting.id },
            update: { data: diarizationData },
            create: { meetingId: meeting.id, data: diarizationData }
          })
          apiLogger.info("Diarization saved", { bot_id: botId })
        }
      } catch {
        // Ignore diarization errors
      }
    }

    // Generate AI content if we have transcript
    if (utterances.length > 0) {
      try {
        apiLogger.info("Generating AI content", { bot_id: botId })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { summary, actionItems } = await generateMeetingAIContent(utterances as any)

        await prisma.summary.upsert({
          where: { meetingId: meeting.id },
          update: {
            overview: summary.overview,
            keyPoints: summary.keyPoints,
            decisions: summary.decisions,
            nextSteps: summary.nextSteps,
          },
          create: {
            meetingId: meeting.id,
            overview: summary.overview,
            keyPoints: summary.keyPoints,
            decisions: summary.decisions,
            nextSteps: summary.nextSteps,
          }
        })

        await prisma.actionItem.deleteMany({ where: { meetingId: meeting.id } })
        if (actionItems.length > 0) {
          await prisma.actionItem.createMany({
            data: actionItems.map(item => ({
              meetingId: meeting.id,
              description: item.description,
              assignee: item.assignee,
              dueDate: item.dueDate,
              completed: item.completed ?? false,
            }))
          })
        }
        apiLogger.info("AI content generated", { bot_id: botId })
      } catch (err) {
        apiLogger.error("Failed to generate AI content", err instanceof Error ? err : undefined, { bot_id: botId })
      }
    }

    // Update final status
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        processingStatus: utterances.length > 0 ? "completed" : "failed",
        videoUrl: botDetails.mp4 || botDetails.video,
        audioUrl: botDetails.audio,
        completedAt: new Date(),
      }
    })

    return NextResponse.json({
      message: "Meeting recovered successfully",
      meeting_id: meeting.id,
      bot_id: botId,
      has_transcript: utterances.length > 0,
      utterance_count: utterances.length,
    })

  } catch (error) {
    apiLogger.error("Failed to recover meeting", error instanceof Error ? error : undefined)
    return NextResponse.json(
      { error: "Failed to recover meeting" },
      { status: 500 }
    )
  }
}
