import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createMeetingBot, listBots, getBotStatus, getTranscript } from "@/lib/api/meetingbaas"
import { generateSummary, extractActionItems } from "@/lib/api/claude"
import type { CreateBotRequest } from "@/lib/data/types"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const apiLogger = logger.child('api:bots')

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as CreateBotRequest

    if (!body.meeting_url) {
      return NextResponse.json(
        { error: "meeting_url is required" },
        { status: 400 }
      )
    }

    const result = await createMeetingBot({
      meeting_url: body.meeting_url,
      bot_name: body.bot_name || "Mekari Callnote",
      recording_mode: body.recording_mode || "speaker_view",
    })

    // Store meeting in database immediately with authenticated user's ID
    await prisma.meeting.create({
      data: {
        botId: result.bot_id,
        userId: user.id,
        botName: body.bot_name || "Mekari Callnote",
        meetingUrl: body.meeting_url,
        status: result.status || "queued",
        ...(body.recording_mode && { recordingMode: body.recording_mode }),
      }
    })

    apiLogger.info("Bot created successfully", { bot_id: result.bot_id, user_id: user.id })
    return NextResponse.json(result)
  } catch (error) {
    apiLogger.error("Failed to create bot", error instanceof Error ? error : undefined, {
      user_id: (await createClient()).auth.getUser().then(r => r.data.user?.id)
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create bot" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const url = new URL(request.url)
    const forceSync = url.searchParams.get("sync") === "true"
    const cursor = url.searchParams.get("cursor")
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20 // Default 20, max 100

    if (forceSync) {
      apiLogger.info("Force sync requested - fetching from MeetingBaas API", { user_id: user.id })
      const bots = await listBots()

      // Sync completed/in-progress bots to database
      const botsToSync = bots.filter(bot =>
        bot.status === "completed" ||
        bot.status === "in_call_recording" ||
        bot.status === "failed"
      )

      let syncedCount = 0
      let processedCount = 0

      if (botsToSync.length > 0) {
        apiLogger.info("Syncing bots to database", {
          user_id: user.id,
          total_bots: bots.length,
          bots_to_sync: botsToSync.length
        })

        // Process each bot - fetch full details and store everything
        for (const bot of botsToSync) {
          try {
            // Check if meeting already exists in database with all data
            const existingMeeting = await prisma.meeting.findUnique({
              where: { botId: bot.bot_id },
              include: { transcript: true, summary: true, actionItems: true }
            })

            // Skip if already fully processed (has summary)
            if (existingMeeting?.summary && existingMeeting.transcript) {
              apiLogger.debug("Meeting already fully synced, skipping", { bot_id: bot.bot_id })
              continue
            }

            // Fetch full bot details from MeetingBaas API (includes media URLs)
            let botDetails
            try {
              botDetails = await getBotStatus(bot.bot_id)
            } catch (fetchError) {
              apiLogger.warn("Failed to fetch bot details", {
                bot_id: bot.bot_id,
                error: fetchError instanceof Error ? fetchError.message : String(fetchError)
              })
              continue
            }

            // Upsert meeting record with full details
            const meeting = await prisma.meeting.upsert({
              where: { botId: bot.bot_id },
              update: {
                status: botDetails.status,
                durationSeconds: botDetails.duration_seconds,
                videoUrl: botDetails.video,
                audioUrl: botDetails.audio,
                transcriptUrl: botDetails.transcription,
                diarizationUrl: botDetails.diarization,
                ...(botDetails.status === "completed" && !existingMeeting?.completedAt && { completedAt: new Date() }),
              },
              create: {
                userId: user.id,
                botId: bot.bot_id,
                botName: botDetails.bot_name || "Potts Recorder",
                meetingUrl: botDetails.meeting_url || "",
                status: botDetails.status,
                durationSeconds: botDetails.duration_seconds,
                videoUrl: botDetails.video,
                audioUrl: botDetails.audio,
                transcriptUrl: botDetails.transcription,
                diarizationUrl: botDetails.diarization,
                completedAt: botDetails.status === "completed" ? new Date() : null,
              }
            })
            syncedCount++

            // For completed meetings, fetch transcript and generate AI content
            if (botDetails.status === "completed" && botDetails.transcription && !existingMeeting?.transcript) {
              try {
                apiLogger.info("Fetching transcript for meeting", { bot_id: bot.bot_id })
                const utterances = await getTranscript(botDetails.transcription)

                if (utterances.length > 0) {
                  // Store transcript in database
                  await prisma.transcript.upsert({
                    where: { meetingId: meeting.id },
                    update: { data: utterances as unknown as object },
                    create: { meetingId: meeting.id, data: utterances as unknown as object }
                  })
                  apiLogger.info("Transcript saved", { bot_id: bot.bot_id, utterance_count: utterances.length })

                  // Generate and store AI summary if not already present
                  if (!existingMeeting?.summary) {
                    try {
                      apiLogger.info("Generating AI summary", { bot_id: bot.bot_id })
                      const [summaryResult, actionItemsResult] = await Promise.all([
                        generateSummary(utterances),
                        extractActionItems(utterances)
                      ])

                      // Store summary
                      await prisma.summary.upsert({
                        where: { meetingId: meeting.id },
                        update: {
                          overview: summaryResult.overview,
                          keyPoints: summaryResult.keyPoints,
                          decisions: summaryResult.decisions,
                          nextSteps: summaryResult.nextSteps,
                        },
                        create: {
                          meetingId: meeting.id,
                          overview: summaryResult.overview,
                          keyPoints: summaryResult.keyPoints,
                          decisions: summaryResult.decisions,
                          nextSteps: summaryResult.nextSteps,
                        }
                      })

                      // Store action items - delete existing and recreate
                      await prisma.actionItem.deleteMany({ where: { meetingId: meeting.id } })
                      if (actionItemsResult.length > 0) {
                        await prisma.actionItem.createMany({
                          data: actionItemsResult.map(item => ({
                            meetingId: meeting.id,
                            description: item.description,
                            assignee: item.assignee,
                            dueDate: item.dueDate,
                            completed: item.completed
                          }))
                        })
                      }

                      apiLogger.info("AI summary and action items saved", {
                        bot_id: bot.bot_id,
                        action_items: actionItemsResult.length
                      })
                      processedCount++
                    } catch (aiError) {
                      apiLogger.warn("Failed to generate AI content", {
                        bot_id: bot.bot_id,
                        error: aiError instanceof Error ? aiError.message : String(aiError)
                      })
                    }
                  }
                }
              } catch (transcriptError) {
                apiLogger.warn("Failed to fetch/process transcript", {
                  bot_id: bot.bot_id,
                  error: transcriptError instanceof Error ? transcriptError.message : String(transcriptError)
                })
              }
            }
          } catch (syncError) {
            apiLogger.warn("Failed to sync bot", {
              bot_id: bot.bot_id,
              error: syncError instanceof Error ? syncError.message : String(syncError)
            })
          }
        }

        apiLogger.info("Sync completed", {
          user_id: user.id,
          synced_count: syncedCount,
          ai_processed_count: processedCount
        })
      }

      // Return the synced data from database
      const syncedMeetings = await prisma.meeting.findMany({
        where: { userId: user.id },
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { summary: true }
      })

      const syncedBots = syncedMeetings.map(m => ({
        bot_id: m.botId,
        bot_name: m.botName,
        status: m.status,
        created_at: m.createdAt.toISOString(),
        meeting_url: m.meetingUrl,
        duration_seconds: m.durationSeconds,
        summary: m.summary
      }))

      return NextResponse.json({ bots: syncedBots, synced: true })
    }

    // 1. Fetch from Database with pagination - Filter by authenticated user
    const dbMeetings = await prisma.meeting.findMany({
      where: { userId: user.id },
      take: limit + 1, // Fetch one extra to determine if there's a next page
      ...(cursor && {
        skip: 1, // Skip the cursor itself
        cursor: { id: cursor }
      }),
      orderBy: { createdAt: "desc" },
      include: { summary: true } // Include summary for preview
    })

    if (dbMeetings.length > 0) {
      const hasMore = dbMeetings.length > limit
      const meetings = hasMore ? dbMeetings.slice(0, limit) : dbMeetings
      const lastMeeting = meetings[meetings.length - 1]
      const nextCursor = hasMore && lastMeeting ? lastMeeting.id : null

      const bots = meetings.map(m => ({
        bot_id: m.botId,
        bot_name: m.botName,
        status: m.status,
        created_at: m.createdAt.toISOString(),
        meeting_url: m.meetingUrl,
        duration_seconds: m.durationSeconds,
        summary: m.summary
      }))

      return NextResponse.json({
        bots,
        pagination: {
          nextCursor,
          hasMore,
          limit
        }
      })
    }

    // 2. Fallback if DB empty: Fetch from API
    apiLogger.info("No meetings in database, fetching from MeetingBaas API", { user_id: user.id })
    const bots = await listBots()
    return NextResponse.json({ bots })

  } catch (error) {
    apiLogger.error("Failed to list bots", error instanceof Error ? error : undefined)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list bots" },
      { status: 500 }
    )
  }
}
