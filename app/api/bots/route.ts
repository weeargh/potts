import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createMeetingBot, listBots } from "@/lib/api/meetingbaas"
import type { CreateBotRequest } from "@/lib/data/types"

export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error creating bot:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create bot" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check if we should force sync
    const url = new URL(request.url)
    const forceSync = url.searchParams.get("sync") === "true"

    if (forceSync) {
      const bots = await listBots()
      // Here we could implement a bulk upsert logic if needed
      // For now, let's just return the live data
      return NextResponse.json({ bots })
    }

    // 1. Fetch from Database
    const dbMeetings = await prisma.meeting.findMany({
      orderBy: { createdAt: "desc" },
      include: { summary: true } // Include summary for preview
    })

    if (dbMeetings.length > 0) {
      const bots = dbMeetings.map(m => ({
        bot_id: m.botId,
        bot_name: m.botName,
        status: m.status,
        created_at: m.createdAt.toISOString(),
        meeting_url: m.meetingUrl,
        duration_seconds: m.durationSeconds,
        summary: m.summary
      }))
      return NextResponse.json({ bots })
    }

    // 2. Fallback if DB empty: Fetch from API
    console.log("No meetings in DB, fetching from API")
    const bots = await listBots()
    return NextResponse.json({ bots })

  } catch (error) {
    console.error("Error listing bots:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list bots" },
      { status: 500 }
    )
  }
}
