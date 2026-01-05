"use client"

import { useState, useEffect, useMemo } from "react"
import { Calendar, Video, Loader2, Clock, RefreshCw, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { CalendarEvent } from "@/lib/api/meetingbaas"

interface UpcomingEventsProps {
    onRefresh?: () => void
}

export function UpcomingEvents({ onRefresh }: UpcomingEventsProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [schedulingEventId, setSchedulingEventId] = useState<string | null>(null)
    const [scheduledEvents, setScheduledEvents] = useState<Set<string>>(new Set())
    const [showCount, setShowCount] = useState(3) // Start with 3 events

    useEffect(() => {
        loadEvents()
    }, [])

    // Filter events: show only those where end_time > now (ongoing + future)
    const upcomingEvents = useMemo(() => {
        const now = new Date()
        return events
            .filter((event) => {
                const endTime = new Date(event.end_time)
                return endTime > now // Show if not yet ended
            })
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    }, [events])

    async function loadEvents() {
        setLoading(true)
        try {
            const response = await fetch("/api/calendar/events?refresh=true")
            const data = await response.json()
            setEvents(data.events || [])

            // Mark events that already have bots scheduled (using bot_scheduled from API)
            const scheduled = new Set<string>()
            data.events?.forEach((event: CalendarEvent) => {
                if (event.bot_scheduled) {
                    scheduled.add(event.event_id)
                }
            })
            setScheduledEvents(scheduled)
        } catch (error) {
            console.error("Failed to load events:", error)
        } finally {
            setLoading(false)
        }
    }

    async function handleScheduleBot(event: CalendarEvent) {
        setSchedulingEventId(event.event_id)
        try {
            const response = await fetch("/api/calendar/schedule-bot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    calendar_id: event.calendar_id,
                    event_id: event.event_id,
                    series_id: event.series_id,
                    bot_name: `Potts - ${event.title}`,
                }),
            })

            if (response.ok) {
                setScheduledEvents(prev => new Set([...prev, event.event_id]))
                onRefresh?.()
            }
        } catch (error) {
            console.error("Failed to schedule bot:", error)
        } finally {
            setSchedulingEventId(null)
        }
    }

    function formatTime(dateString: string) {
        return new Date(dateString).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        })
    }

    function formatDate(dateString: string) {
        const date = new Date(dateString)
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        if (date.toDateString() === today.toDateString()) {
            return "Today"
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return "Tomorrow"
        }
        return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    }

    function getMeetingPlatform(url: string | null): string {
        if (!url) return "Meeting"
        if (url.includes("zoom")) return "Zoom"
        if (url.includes("meet.google")) return "Google Meet"
        if (url.includes("teams.microsoft")) return "Teams"
        return "Meeting"
    }

    function isOngoing(event: CalendarEvent): boolean {
        const now = new Date()
        const start = new Date(event.start_time)
        const end = new Date(event.end_time)
        return start <= now && end > now
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (upcomingEvents.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No upcoming meetings with video links</p>
                <Button variant="ghost" size="sm" onClick={loadEvents} className="mt-2">
                    Refresh
                </Button>
            </div>
        )
    }

    const displayedEvents = upcomingEvents.slice(0, showCount)
    const hasMore = upcomingEvents.length > showCount

    return (
        <div className="space-y-3">
            {displayedEvents.map((event) => {
                const isScheduled = scheduledEvents.has(event.event_id)
                const isScheduling = schedulingEventId === event.event_id
                const ongoing = isOngoing(event)

                return (
                    <div
                        key={event.event_id}
                        className={`flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors ${ongoing ? "border-primary/50 bg-primary/5" : "border-border"
                            }`}
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-foreground truncate">{event.title}</h4>
                                <Badge variant="secondary" className="text-xs">
                                    {getMeetingPlatform(event.meeting_url)}
                                </Badge>
                                {ongoing && (
                                    <Badge variant="default" className="text-xs bg-green-600">
                                        Ongoing
                                    </Badge>
                                )}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatDate(event.start_time)} at {formatTime(event.start_time)}
                                </span>
                            </div>
                        </div>

                        <Button
                            size="sm"
                            variant={isScheduled ? "secondary" : "default"}
                            disabled={isScheduled || isScheduling}
                            onClick={() => handleScheduleBot(event)}
                            className="ml-4 gap-1.5"
                        >
                            {isScheduling ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Video className="w-4 h-4" />
                            )}
                            {isScheduled ? "Scheduled" : isScheduling ? "Scheduling..." : "Record"}
                        </Button>
                    </div>
                )
            })}

            {/* Show More button */}
            {hasMore && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCount(prev => prev + 3)}
                    className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <ChevronDown className="w-4 h-4" />
                    Show more
                </Button>
            )}

            {/* Refresh button */}
            <div className="flex justify-center pt-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadEvents}
                    disabled={loading}
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    Refresh
                </Button>
            </div>
        </div>
    )
}
