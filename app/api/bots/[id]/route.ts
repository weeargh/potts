import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getBotStatus, getTranscript } from "@/lib/api/meetingbaas"
import { generateSummary, extractActionItems } from "@/lib/api/claude"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. Try fetching from Database first
    const dbMeeting = await prisma.meeting.findUnique({
      where: { botId: id },
      include: {
        transcript: true,
        summary: true,
        actionItems: true,
      }
    })

    // If we have a completed meeting with summary in DB, return it instantly!
    if (dbMeeting && dbMeeting.status === "completed" && dbMeeting.summary) {
      console.log("Serving meeting from DB:", id)
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
    console.log("Meeting not in DB or incomplete, fetching from API:", id)
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
          summary = result[0] as any
          actionItems = result[1] as any // Type assertion for initial response
        }

        // SAVE to DB for next time (Lazy persistence)
        await prisma.meeting.upsert({
          where: { botId: id },
          update: {
            status: "completed",
            durationSeconds: meeting.duration_seconds,
            videoUrl: meeting.video,
            audioUrl: meeting.audio,
            transcriptUrl: meeting.transcription,
            completedAt: new Date(),
          },
          create: {
            botId: id,
            userId: "00000000-0000-0000-0000-000000000000",
            botName: meeting.bot_name || "Unknown Meeting",
            meetingUrl: meeting.meeting_url || "unknown",
            status: "completed",
          }
        }).then(async (m) => {
          // Save transcript
          await prisma.transcript.upsert({
            where: { meetingId: m.id },
            update: { data: utterances as any },
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
    console.error("Error fetching bot:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch bot" },
      { status: 500 }
    )
  }
}
