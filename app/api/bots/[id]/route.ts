import { NextRequest, NextResponse } from "next/server"
import { getBotStatus, getTranscript } from "@/lib/api/meetingbaas"
import { generateSummary, extractActionItems } from "@/lib/api/claude"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const meeting = await getBotStatus(id)

    if (meeting.status === "completed" && meeting.transcription) {
      const utterances = await getTranscript(meeting.transcription)

      if (utterances.length > 0 && !meeting.summary) {
        const [summary, actionItems] = await Promise.all([
          generateSummary(utterances),
          extractActionItems(utterances),
        ])

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
