import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createMeetingBot } from "@/lib/api/meetingbaas"
import type { CreateBotRequest } from "@/lib/data/types"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { ensureUserExists } from "@/lib/utils/ensure-user"

const apiLogger = logger.child('api:bots')

/**
 * POST /api/bots
 *
 * Create a new recording bot.
 * Creates bot via MeetingBaas and stores initial record in Supabase.
 * Webhook handler will process completion and store all content.
 */
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

    await ensureUserExists(user)

    const body = (await request.json()) as CreateBotRequest

    if (!body.meeting_url) {
      return NextResponse.json(
        { error: "meeting_url is required" },
        { status: 400 }
      )
    }

    const result = await createMeetingBot({
      meeting_url: body.meeting_url,
      bot_name: body.bot_name || "Notula - AI Notetaker",
      recording_mode: body.recording_mode || "speaker_view",
      user_id: user.id,  // Pass user_id for webhook association
    })

    // Store meeting in database with pending status
    await prisma.meeting.create({
      data: {
        botId: result.bot_id,
        userId: user.id,
        botName: body.bot_name || "Notula - AI Notetaker",
        meetingUrl: body.meeting_url,
        status: result.status || "queued",
        processingStatus: "pending",
        ...(body.recording_mode && { recordingMode: body.recording_mode }),
        extra: { user_id: user.id },
      }
    })

    apiLogger.info("Bot created", { bot_id: result.bot_id, user_id: user.id })
    return NextResponse.json(result)
  } catch (error) {
    apiLogger.error("Failed to create bot", error instanceof Error ? error : undefined)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create bot" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/bots
 *
 * List all meetings for the authenticated user.
 * ONLY reads from Supabase - no MeetingBaas API fallback.
 * Supports cursor-based pagination.
 */
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

    await ensureUserExists(user)

    // Parse pagination parameters
    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor")
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20

    // Status filter - by default exclude queued/scheduled meetings (future meetings)
    const statusFilter = url.searchParams.get("status")
    const excludeQueued = url.searchParams.get("exclude_queued") !== "false"

    // Fetch meetings from database
    const meetings = await prisma.meeting.findMany({
      where: {
        userId: user.id,
        // Exclude queued/joining meetings by default (these are scheduled future meetings)
        ...(excludeQueued && !statusFilter && {
          status: { notIn: ["queued", "joining_call", "in_waiting_room"] }
        }),
        // If specific status requested, filter by that
        ...(statusFilter && { status: statusFilter }),
      },
      take: limit + 1,  // Fetch one extra for pagination
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor }
      }),
      orderBy: { createdAt: "desc" },
      include: {
        summary: {
          select: {
            overview: true,
          }
        }
      }
    })

    // Determine pagination
    const hasMore = meetings.length > limit
    const items = hasMore ? meetings.slice(0, limit) : meetings
    const lastItem = items[items.length - 1]
    const nextCursor = hasMore && lastItem ? lastItem.id : null

    // Map to response format
    const bots = items.map(m => ({
      bot_id: m.botId,
      bot_name: m.botName,
      meeting_url: m.meetingUrl,
      status: m.status,
      processing_status: m.processingStatus,
      duration_seconds: m.durationSeconds,
      created_at: m.createdAt.toISOString(),
      completed_at: m.completedAt?.toISOString(),
      error_code: m.errorCode,
      summary_preview: m.summary?.overview?.substring(0, 150),
    }))

    apiLogger.debug("Listing meetings", {
      user_id: user.id,
      count: bots.length,
      has_more: hasMore
    })

    return NextResponse.json({
      bots,
      pagination: {
        nextCursor,
        hasMore,
        limit
      }
    }, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120'
      }
    })
  } catch (error) {
    apiLogger.error("Failed to list meetings", error instanceof Error ? error : undefined)
    return NextResponse.json(
      { error: "Failed to list meetings" },
      { status: 500 }
    )
  }
}
