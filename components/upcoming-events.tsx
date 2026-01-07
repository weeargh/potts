"use client"

import { useState, useMemo, useEffect } from "react"
import { Calendar, Video, Loader2, RefreshCw, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCalendarEvents } from "@/lib/hooks/use-calendar-events"
import type { CalendarEvent } from "@/lib/api/meetingbaas"

interface UpcomingEventsProps {
    onRefresh?: () => void
}

export function UpcomingEvents({ onRefresh }: UpcomingEventsProps) {
    const { events, isLoading, isValidating, refresh } = useCalendarEvents()
    const [schedulingEventId, setSchedulingEventId] = useState<string | null>(null)
    const [scheduledEvents, setScheduledEvents] = useState<Set<string>>(new Set())
    const [showCount, setShowCount] = useState(3)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // Initialize scheduled events from API data - useEffect instead of useMemo for side effects
    useEffect(() => {
        const scheduled = new Set<string>()
        events.forEach((event: CalendarEvent) => {
            if (event.bot_scheduled) {
                scheduled.add(event.event_id)
            }
        })
        if (scheduled.size > 0) {
            setScheduledEvents(prev => {
                const merged = new Set([...prev, ...scheduled])
                return merged
            })
        }
    }, [events])

    // Filter events: show only those where end_time > now (ongoing + future)
    const upcomingEvents = useMemo(() => {
        const now = new Date()
        return events
            .filter((event) => {
                const endTime = new Date(event.end_time)
                return endTime > now
            })
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    }, [events])

    async function handleRefresh() {
        setIsRefreshing(true)
        try {
            await refresh()
            onRefresh?.()
        } finally {
            setIsRefreshing(false)
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
                    bot_name: event.title,
                    all_occurrences: !!event.series_id,  // Schedule all for recurring
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

    // Show loading only on initial load (not on revalidation)
    if (isLoading && events.length === 0) {
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
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="mt-2"
                >
                    {isRefreshing ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                        <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    Refresh
                </Button>
            </div>
        )
    }

    const displayedEvents = upcomingEvents.slice(0, showCount)
    const hasMore = upcomingEvents.length > showCount

    return (
        <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="divide-y divide-border">
                {displayedEvents.map((event) => {
                    const isScheduled = scheduledEvents.has(event.event_id)
                    const isScheduling = schedulingEventId === event.event_id
                    const ongoing = isOngoing(event)

                    return (
                        <div
                            key={event.event_id}
                            className={`flex items-center gap-4 py-3 px-4 hover:bg-muted/30 transition-colors ${ongoing ? "bg-primary/5" : ""}`}
                        >
                            {/* Time Column - Fixed Width */}
                            <div className="w-24 shrink-0 flex flex-col justify-center">
                                <span className={`text-sm font-medium ${ongoing ? "text-primary" : "text-foreground"}`}>
                                    {formatTime(event.start_time)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatDate(event.start_time)}
                                </span>
                            </div>

                            {/* Info Column - Flexible */}
                            <div className="flex-1 min-w-0 flex items-center gap-3">
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-sm text-foreground truncate">{event.title}</h4>
                                        {ongoing && (
                                            <Badge variant="default" className="text-[10px] px-1.5 h-5 bg-green-600 hover:bg-green-700">
                                                Ongoing
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-normal text-muted-foreground border-border">
                                            {getMeetingPlatform(event.meeting_url)}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Action Column */}
                            <div className="shrink-0">
                                <Button
                                    size="sm"
                                    variant={isScheduled ? "secondary" : "default"}
                                    disabled={isScheduled || isScheduling}
                                    onClick={() => handleScheduleBot(event)}
                                    className="h-8 px-3 text-xs gap-1.5"
                                >
                                    {isScheduling ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Video className="w-3.5 h-3.5" />
                                    )}
                                    {isScheduled ? "Scheduled" : isScheduling ? "Scheduling..." : "Record"}
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer with Show More / Refresh */}
            {(hasMore || events.length > 0) && (
                <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-t border-border">
                    {hasMore ? (
                        <button
                            onClick={() => setShowCount(prev => prev + 5)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                            <ChevronDown className="w-3 h-3" />
                            Show more
                        </button>
                    ) : <div></div>}

                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3 h-3 ${isRefreshing || isValidating ? "animate-spin" : ""}`} />
                        {isValidating && !isRefreshing ? "Updating..." : "Refresh list"}
                    </button>
                </div>
            )}
        </div>
    )
}
