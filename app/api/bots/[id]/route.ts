import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getBotStatus, getTranscript } from "@/lib/api/meetingbaas"
import { generateSummary, extractActionItems } from "@/lib/api/claude"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const apiLogger = logger.child('api:bots:id')

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

    const { id } = await params

    // 1. Try fetching from Database first - verify user owns this meeting
    const dbMeeting = await prisma.meeting.findFirst({
      where: {
        botId: id,
        userId: user.id // Only return if user owns this meeting
      },
      include: {
        transcript: true,
        summary: true,
        actionItems: true,
      }
    })

    // If we have a completed meeting with summary in DB, return it instantly!
    if (dbMeeting && dbMeeting.status === "completed" && dbMeeting.summary) {
      apiLogger.info("Serving completed meeting from database", { bot_id: id, user_id: user.id })
      return NextResponse.json({
        ...dbMeeting,
        bot_id: dbMeeting.botId,
        bot_name: dbMeeting.botName,
        meeting_url: dbMeeting.meetingUrl,
        created_at: dbMeeting.createdAt.toISOString(),
        duration_seconds: dbMeeting.durationSeconds,
        video: dbMeeting.videoUrl,
        audio: dbMeeting.audioUrl,
        transcription: dbMeeting.transcriptUrl,
        utterances: dbMeeting.transcript?.data || [],
        summary: dbMeeting.summary,
        actionItems: dbMeeting.actionItems,
      })
    }

    // 2. Fallback: Fetch from MeetingBaas API
    apiLogger.info("Meeting not in database or incomplete, fetching from MeetingBaas API", {
      bot_id: id,
      user_id: user.id,
      has_db_meeting: !!dbMeeting,
      db_status: dbMeeting?.status
    })
    const meeting = await getBotStatus(id)

    // Check if we can upgrade this to a completed meeting with summary
    if (meeting.status === "completed" && meeting.transcription) {
      const utterances = await getTranscript(meeting.transcription)

      if (utterances.length > 0) {
        // Generate summary if missing
        let summary = dbMeeting?.summary
        let actionItems = dbMeeting?.actionItems || []

        if (!summary) {
          const result = await Promise.all([
            generateSummary(utterances),
            extractActionItems(utterances),
          ])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          summary = result[0] as any
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          actionItems = result[1] as any // Type assertion for initial response
        }

        // SAVE to DB for next time (Lazy persistence)
        // Only update if meeting already exists (which it should from POST /api/bots)
        if (dbMeeting) {
          await prisma.meeting.update({
            where: { id: dbMeeting.id },
            data: {
              status: "completed",
              durationSeconds: meeting.duration_seconds,
              videoUrl: meeting.video,
              audioUrl: meeting.audio,
              transcriptUrl: meeting.transcription,
              completedAt: new Date(),
            }
          }).then(async (m) => {
            // Save transcript
            await prisma.transcript.upsert({
              where: { meetingId: m.id },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              update: { data: utterances as any },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              create: { meetingId: m.id, data: utterances as any }
            })

            // Save Summary if we generated it
            if (summary && !dbMeeting?.summary) {
              await prisma.summary.create({
                data: {
                  meetingId: m.id,
                  overview: summary.overview,
                  keyPoints: summary.keyPoints,
                  decisions: summary.decisions,
                  nextSteps: summary.nextSteps
                }
              })
            }
          }).catch(err => console.error("Failed to lazy-save meeting:", err))
        }

        return NextResponse.json({
          ...meeting,
          summary,
          actionItems,
          utterances,
        })
      }

      return NextResponse.json({
        ...meeting,
        utterances,
      })
    }

    return NextResponse.json(meeting)
  } catch (error) {
    apiLogger.error("Failed to fetch bot details", error instanceof Error ? error : undefined, {
      bot_id: (await params).id
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch bot" },
      { status: 500 }
    )
  }
}
