import { NextRequest, NextResponse } from "next/server"
import { scheduleCalendarBot } from "@/lib/api/meetingbaas"
import { createClient } from "@/lib/supabase/server"
import { ensureUserExists } from "@/lib/utils/ensure-user"

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

        // Ensure user exists in database
        await ensureUserExists(user)

        const body = await request.json()
        const { calendar_id, event_id, series_id, bot_name } = body

        if (!calendar_id || !event_id) {
            return NextResponse.json(
                { error: "calendar_id and event_id are required" },
                { status: 400 }
            )
        }

        const result = await scheduleCalendarBot(calendar_id, event_id, {
            botName: bot_name || "Potts Recorder",
            seriesId: series_id, // Pass series_id to fix MeetingBaas API validation
            userId: user.id,     // Pass user_id for webhook association
        })

        return NextResponse.json({
            success: true,
            bot_id: result.bot_id,
        })
    } catch (error) {
        console.error("Failed to schedule bot:", error)
        return NextResponse.json(
            { error: "Failed to schedule recording bot" },
            { status: 500 }
        )
    }
}
