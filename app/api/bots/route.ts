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
      const bots = await listBots()
      // Here we could implement a bulk upsert logic if needed
      // For now, let's just return the live data
      return NextResponse.json({ bots })
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
