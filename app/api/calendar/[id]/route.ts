import { NextRequest, NextResponse } from "next/server"
import { deleteCalendar } from "@/lib/api/meetingbaas"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

const log = logger.child('api:calendar:delete')

/**
 * DELETE /api/calendar/[id] - Disconnect a calendar
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: calendarId } = await params

    if (!calendarId) {
        return NextResponse.json({ error: "Calendar ID required" }, { status: 400 })
    }

    log.info("Disconnecting calendar", { calendar_id: calendarId, user_id: user.id })

    try {
        // Verify user owns this calendar
        const calendarAccount = await prisma.calendarAccount.findFirst({
            where: {
                meetingbaasCalendarId: calendarId,
                userId: user.id
            }
        })

        if (!calendarAccount) {
            log.warn("Calendar not found or not owned by user", { calendar_id: calendarId, user_id: user.id })
            return NextResponse.json({ error: "Calendar not found" }, { status: 404 })
        }

        // Delete from MeetingBaas
        try {
            await deleteCalendar(calendarId)
            log.info("Deleted calendar from MeetingBaas", { calendar_id: calendarId })
        } catch (mbError) {
            log.warn("Failed to delete from MeetingBaas (may already be deleted)", {
                calendar_id: calendarId,
                error: mbError instanceof Error ? mbError.message : String(mbError)
            })
            // Continue - still remove from our database
        }

        // Delete from our database
        await prisma.calendarAccount.delete({
            where: { id: calendarAccount.id }
        })

        // Also delete cached calendar events
        await prisma.calendarEvent.deleteMany({
            where: { calendarId: calendarId }
        })

        log.info("Calendar disconnected successfully", { calendar_id: calendarId })

        return NextResponse.json({ success: true, message: "Calendar disconnected" })
    } catch (error) {
        log.error("Failed to disconnect calendar", error instanceof Error ? error : undefined, {
            calendar_id: calendarId
        })
        return NextResponse.json(
            { error: "Failed to disconnect calendar" },
            { status: 500 }
        )
    }
}
