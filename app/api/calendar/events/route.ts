import { NextRequest, NextResponse } from "next/server"
import { listCalendars, listCalendarEvents } from "@/lib/api/meetingbaas"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const calendarId = searchParams.get("calendar_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const forceRefresh = searchParams.get("refresh") === "true"

    try {
        // If no calendar_id provided, return empty
        // We'll focus caching on specific calendar fetching for now
        if (!calendarId) {
            let calendars: Awaited<ReturnType<typeof listCalendars>> = []
            try {
                calendars = await listCalendars()
            } catch (err) {
                console.log("No calendars connected or MeetingBaas error:", err)
                return NextResponse.json({ events: [], calendars: [], message: "No calendars connected" })
            }

            if (calendars.length === 0) {
                return NextResponse.json({ events: [], calendars: [], message: "No calendars connected" })
            }

            // For "all calendars", we just fetch cache-first for each
            // This is slightly inefficient but safer than complex multi-cal caching logic right now
            const allEvents = await Promise.all(
                calendars.map(async (cal) => {
                    return await getEventsWithCache(cal.calendar_id, forceRefresh, startDate, endDate)
                })
            )
            const events = allEvents
                .flat()
                .filter(e => e.meeting_url)
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

            return NextResponse.json({ events, calendars })
        }

        // Get events for specific calendar with caching
        const events = await getEventsWithCache(calendarId, forceRefresh, startDate, endDate)

        return NextResponse.json({
            events: events.filter(e => e.meeting_url)
        })
    } catch (error) {
        console.error("Failed to fetch calendar events:", error)
        return NextResponse.json({
            events: [],
            calendars: [],
            error: "Failed to fetch calendar events"
        })
    }
}

async function getEventsWithCache(calendarId: string, forceRefresh: boolean, startDate?: string | null, endDate?: string | null) {
    // 1. Calculate cache expiry (8 hours ago)
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000)

    // 2. Check DB for valid cache
    if (!forceRefresh) {
        const cachedCount = await prisma.calendarEvent.count({
            where: {
                calendarId: calendarId,
                lastFetchedAt: { gt: eightHoursAgo }
            }
        })

        if (cachedCount > 0) {
            console.log(`Using cached events for calendar ${calendarId}`)
            const cachedEvents = await prisma.calendarEvent.findMany({
                where: { calendarId: calendarId },
                orderBy: { startTime: 'asc' }
            })

            // Map back to API format
            return cachedEvents.map(e => ({
                event_id: e.eventId,
                calendar_id: e.calendarId,
                title: e.title,
                start_time: e.startTime.toISOString(),
                end_time: e.endTime.toISOString(),
                meeting_url: e.meetingUrl,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                meeting_platform: e.platform as any,
                bot_scheduled: e.botScheduled,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(e.rawData as any)
            }))
        }
    }

    // 3. Cache miss or forced refresh: Fetch from API
    console.log(`Fetching fresh events for calendar ${calendarId}`)
    const events = await listCalendarEvents(calendarId, {
        startDate: startDate || new Date().toISOString().split("T")[0],
        endDate: endDate || undefined,
        limit: 50,
    })

    // 4. Save to DB (Upsert)
    // We do this asynchronously to not block the UI response too much, 
    // BUT since we want to return the fresh data, we await it or just return 'events' while saving in background.
    // To be safe and consistent, we await the save.

    // Transactional upsert is safer
    await prisma.$transaction(
        events.map(event =>
            prisma.calendarEvent.upsert({
                where: { eventId: event.event_id },
                update: {
                    title: event.title,
                    startTime: new Date(event.start_time),
                    endTime: new Date(event.end_time),
                    meetingUrl: event.meeting_url,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    platform: event.meeting_platform,
                    botScheduled: event.bot_scheduled || false,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    rawData: event as any,
                    lastFetchedAt: new Date()
                },
                create: {
                    eventId: event.event_id,
                    calendarId: calendarId,
                    title: event.title,
                    startTime: new Date(event.start_time),
                    endTime: new Date(event.end_time),
                    meetingUrl: event.meeting_url,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    platform: event.meeting_platform,
                    botScheduled: event.bot_scheduled || false,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    rawData: event as any,
                    lastFetchedAt: new Date()
                }
            })
        )
    ).catch(err => console.error("Failed to cache calendar events:", err))

    return events
}

