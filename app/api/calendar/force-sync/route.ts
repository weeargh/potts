import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { autoScheduleBotsForEvents } from "@/lib/api/auto-schedule"
import { logger } from "@/lib/logger"

const log = logger.child('api:force-sync')

/**
 * POST /api/calendar/force-sync
 * Force sync all calendars for the current user and schedule bots for unscheduled events
 */
export async function POST() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Get all calendar accounts for this user
        const calendars = await prisma.calendarAccount.findMany({
            where: {
                userId: user.id,
                isActive: true,
                meetingbaasCalendarId: { not: null }
            },
            select: { meetingbaasCalendarId: true, email: true }
        })

        if (calendars.length === 0) {
            return NextResponse.json({
                message: "No connected calendars found",
                scheduled: 0,
                failed: 0,
                skipped: 0
            })
        }

        log.info("Force sync started", { user_id: user.id, calendar_count: calendars.length })

        // Run auto-schedule for each calendar
        let totalScheduled = 0
        let totalFailed = 0
        let totalSkipped = 0
        const errors: string[] = []

        for (const calendar of calendars) {
            if (!calendar.meetingbaasCalendarId) continue

            const result = await autoScheduleBotsForEvents(calendar.meetingbaasCalendarId)
            totalScheduled += result.scheduled
            totalFailed += result.failed
            totalSkipped += result.skipped
            errors.push(...result.errors)
        }

        log.info("Force sync complete", {
            user_id: user.id,
            scheduled: totalScheduled,
            failed: totalFailed,
            skipped: totalSkipped
        })

        return NextResponse.json({
            message: `Synced ${calendars.length} calendar(s)`,
            scheduled: totalScheduled,
            failed: totalFailed,
            skipped: totalSkipped,
            errors: errors.length > 0 ? errors : undefined
        })
    } catch (error) {
        log.error("Force sync failed", error instanceof Error ? error : undefined)
        return NextResponse.json(
            { error: "Force sync failed" },
            { status: 500 }
        )
    }
}
