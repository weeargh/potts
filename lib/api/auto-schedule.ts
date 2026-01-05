/**
 * Auto-schedule bots for calendar events
 * 
 * This module provides functionality to automatically schedule recording bots
 * for all upcoming calendar events that have meeting URLs.
 */

import { listCalendars, listCalendarEvents, scheduleCalendarBot, CalendarEvent } from "./meetingbaas"

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

        console.log(`Auto-schedule: processing ${calendars.length} calendar(s)`)

        for (const cal of calendars) {
            try {
                // Fetch events from today onwards
                const events = await listCalendarEvents(cal.calendar_id, {
                    startDate: new Date().toISOString().split("T")[0],
                    limit: 50,
                })

                console.log(`Auto-schedule: found ${events.length} events for calendar ${cal.calendar_id}`)

                // Filter events that need bot scheduling
                const eventsToSchedule = events.filter((event: CalendarEvent) =>
                    event.meeting_url && // Has a meeting URL
                    !event.bot_scheduled && // No bot scheduled yet
                    new Date(event.start_time) > new Date() // In the future
                )

                console.log(`Auto-schedule: ${eventsToSchedule.length} events need bot scheduling`)

                // Schedule bots for each event
                for (const event of eventsToSchedule) {
                    try {
                        await scheduleCalendarBot(cal.calendar_id, event.event_id, {
                            botName: `Potts - ${event.title}`,
                            seriesId: event.series_id,
                        })
                        result.scheduled++
                        console.log(`Auto-schedule: scheduled bot for "${event.title}" at ${event.start_time}`)

                        // Rate limit: wait between scheduling requests
                        await new Promise(resolve => setTimeout(resolve, 1000))
                    } catch (err) {
                        result.failed++
                        const errorMsg = err instanceof Error ? err.message : String(err)
                        result.errors.push(`Failed to schedule "${event.title}": ${errorMsg}`)
                        console.error(`Auto-schedule: failed for "${event.title}":`, errorMsg)
                    }
                }

                result.skipped += events.length - eventsToSchedule.length
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err)
                result.errors.push(`Failed to process calendar ${cal.calendar_id}: ${errorMsg}`)
                console.error(`Auto-schedule: failed to process calendar:`, errorMsg)
            }
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to list calendars: ${errorMsg}`)
        console.error(`Auto-schedule: failed to list calendars:`, errorMsg)
    }

    console.log(`Auto-schedule complete: ${result.scheduled} scheduled, ${result.failed} failed, ${result.skipped} skipped`)
    return result
}
