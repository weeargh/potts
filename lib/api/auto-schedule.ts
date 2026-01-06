/**
 * Auto-schedule bots for calendar events
 *
 * This module provides functionality to automatically schedule recording bots
 * for all upcoming calendar events that have meeting URLs.
 */

import { listCalendars, listCalendarEvents, scheduleCalendarBot, CalendarEvent } from "./meetingbaas"
import { logger } from "@/lib/logger"

const log = logger.child('auto-schedule')

interface AutoScheduleResult {
    scheduled: number
    failed: number
    skipped: number
    errors: string[]
}

/**
 * Auto-schedule bots for all upcoming events that have meeting URLs but no bots scheduled yet.
 * 
 * @param calendarId - Optional specific calendar ID. If not provided, processes all calendars.
 * @returns Summary of scheduling results
 */
export async function autoScheduleBotsForEvents(calendarId?: string): Promise<AutoScheduleResult> {
    const result: AutoScheduleResult = {
        scheduled: 0,
        failed: 0,
        skipped: 0,
        errors: [],
    }

    try {
        // Get calendars to process
        const calendars = calendarId
            ? [{ calendar_id: calendarId }]
            : await listCalendars()

        log.info("Processing calendars", { count: calendars.length })

        for (const cal of calendars) {
            try {
                // Fetch events from today onwards
                const events = await listCalendarEvents(cal.calendar_id, {
                    startDate: new Date().toISOString().split("T")[0],
                    limit: 50,
                })

                log.debug("Found events for calendar", { calendar_id: cal.calendar_id, count: events.length })

                // Filter events that need bot scheduling
                const eventsToSchedule = events.filter((event: CalendarEvent) =>
                    event.meeting_url && // Has a meeting URL
                    !event.bot_scheduled && // No bot scheduled yet
                    new Date(event.start_time) > new Date() // In the future
                )

                log.debug("Events need bot scheduling", { count: eventsToSchedule.length })

                // Schedule bots for each event
                for (const event of eventsToSchedule) {
                    try {
                        await scheduleCalendarBot(cal.calendar_id, event.event_id, {
                            botName: `Potts - ${event.title}`,
                            seriesId: event.series_id,
                        })
                        result.scheduled++
                        log.info("Scheduled bot for event", { title: event.title, start_time: event.start_time })

                        // Rate limit: wait between scheduling requests
                        await new Promise(resolve => setTimeout(resolve, 1000))
                    } catch (err) {
                        result.failed++
                        const errorMsg = err instanceof Error ? err.message : String(err)
                        result.errors.push(`Failed to schedule "${event.title}": ${errorMsg}`)
                        log.error("Failed to schedule bot", err instanceof Error ? err : undefined, { title: event.title })
                    }
                }

                result.skipped += events.length - eventsToSchedule.length
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err)
                result.errors.push(`Failed to process calendar ${cal.calendar_id}: ${errorMsg}`)
                log.error("Failed to process calendar", err instanceof Error ? err : undefined, { calendar_id: cal.calendar_id })
            }
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to list calendars: ${errorMsg}`)
        log.error("Failed to list calendars", err instanceof Error ? err : undefined)
    }

    log.info("Auto-schedule complete", { scheduled: result.scheduled, failed: result.failed, skipped: result.skipped })
    return result
}
