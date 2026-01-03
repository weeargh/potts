import { NextRequest, NextResponse } from "next/server"
import { listCalendars, listCalendarEvents } from "@/lib/api/meetingbaas"

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const calendarId = searchParams.get("calendar_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    try {
        // If no calendar_id provided, first get the list of calendars
        if (!calendarId) {
            let calendars: Awaited<ReturnType<typeof listCalendars>> = []

            try {
                calendars = await listCalendars()
            } catch (err) {
                // No calendars connected yet - this is normal
                console.log("No calendars connected or MeetingBaas error:", err)
                return NextResponse.json({
                    events: [],
                    calendars: [],
                    message: "No calendars connected"
                })
            }

            if (calendars.length === 0) {
                return NextResponse.json({
                    events: [],
                    calendars: [],
                    message: "No calendars connected"
                })
            }

            // Get events from all connected calendars
            const allEvents = await Promise.all(
                calendars.map(async (cal) => {
                    try {
                        const events = await listCalendarEvents(cal.uuid, {
                            startDate: startDate || new Date().toISOString().split("T")[0],
                            endDate: endDate || undefined,
                            limit: 50,
                        })
                        return events
                    } catch (err) {
                        console.error(`Failed to fetch events for calendar ${cal.uuid}:`, err)
                        return []
                    }
                })
            )

            // Flatten and sort by start time
            const events = allEvents
                .flat()
                .filter(e => e.meeting_url) // Only events with meeting URLs
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

            return NextResponse.json({
                events,
                calendars,
            })
        }

        // Get events for specific calendar
        const events = await listCalendarEvents(calendarId, {
            startDate: startDate || new Date().toISOString().split("T")[0],
            endDate: endDate || undefined,
            limit: 50,
        })

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

