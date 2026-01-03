import { NextRequest, NextResponse } from "next/server"
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

export async function GET() {
  try {
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
