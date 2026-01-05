import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createMeetingBot, listBots } from "@/lib/api/meetingbaas"
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

      if (botsToSync.length > 0) {
        apiLogger.info("Syncing bots to database", {
          user_id: user.id,
          total_bots: bots.length,
          bots_to_sync: botsToSync.length
        })

        // Upsert each bot to database
        // Note: MeetingBaas list API returns 'duration' not 'duration_seconds' and doesn't include media URLs
        for (const bot of botsToSync) {
          try {
            // Type cast to handle API response where duration may be named differently
            const botData = bot as unknown as {
              bot_id: string
              bot_name?: string
              meeting_url?: string
              status: string
              duration?: number
              duration_seconds?: number
              video?: string
              audio?: string
              transcription?: string
              created_at?: string
            }
            const durationSeconds = botData.duration_seconds ?? botData.duration ?? null

            await prisma.meeting.upsert({
              where: { botId: bot.bot_id },
              update: {
                status: bot.status,
                durationSeconds: durationSeconds,
                ...(botData.video && { videoUrl: botData.video }),
                ...(botData.audio && { audioUrl: botData.audio }),
                ...(botData.transcription && { transcriptUrl: botData.transcription }),
                ...(bot.status === "completed" && { completedAt: new Date() }),
              },
              create: {
                userId: user.id,
                botId: bot.bot_id,
                botName: bot.bot_name || "Potts Recorder",
                meetingUrl: bot.meeting_url || "",
                status: bot.status,
                durationSeconds: durationSeconds,
                ...(botData.video && { videoUrl: botData.video }),
                ...(botData.audio && { audioUrl: botData.audio }),
                ...(botData.transcription && { transcriptUrl: botData.transcription }),
                ...(bot.status === "completed" && { completedAt: new Date() }),
                ...(botData.created_at && { createdAt: new Date(botData.created_at) }),
              }
            })
          } catch (upsertError) {
            apiLogger.warn("Failed to upsert bot", {
              bot_id: bot.bot_id,
              error: upsertError instanceof Error ? upsertError.message : String(upsertError)
            })
          }
        }

        apiLogger.info("Sync completed", { user_id: user.id, synced_count: botsToSync.length })
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
