"use client"

import { useState, useEffect } from "react"
import { Calendar, Loader2, CheckCircle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCalendarEvents } from "@/lib/hooks/use-calendar-events"

interface CalendarConnectButtonProps {
    onConnected?: () => void
}

export function CalendarConnectButton({ onConnected }: CalendarConnectButtonProps) {
    const { calendars, isLoading } = useCalendarEvents()
    const [isConnecting, setIsConnecting] = useState(false)

    useEffect(() => {
        // Check URL params for connection status
        const params = new URLSearchParams(window.location.search)
        const justConnected = params.get("calendar_connected") === "true"

        if (justConnected) {
            window.history.replaceState({}, "", window.location.pathname)
            onConnected?.()
        }
    }, [onConnected])

    useEffect(() => {
        if (calendars.length > 0) {
            onConnected?.()
        }
    }, [calendars, onConnected])

    const handleConnect = () => {
        setIsConnecting(true)
        window.location.href = "/api/calendar/connect"
    }

    if (isLoading) {
        return (
            <Button variant="outline" disabled className="gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking...
            </Button>
        )
    }

    if (calendars.length > 0) {
        return (
            <div className="flex items-center gap-2">
                <Button variant="outline" className="gap-2 text-green-600 border-green-200 hover:bg-green-50 cursor-default">
                    <CheckCircle className="w-4 h-4" />
                    {calendars.length} Calendar{calendars.length > 1 ? "s" : ""} Connected
                </Button>
                <Button
                    onClick={handleConnect}
                    variant="ghost"
                    size="sm"
                    disabled={isConnecting}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                    title="Add another Google Calendar"
                >
                    {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Plus className="w-4 h-4" />
                    )}
                    Add
                </Button>
            </div>
        )
    }

    return (
        <Button
            onClick={handleConnect}
            disabled={isConnecting}
            variant="outline"
            className="gap-2"
        >
            {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <Calendar className="w-4 h-4" />
            )}
            {isConnecting ? "Connecting..." : "Connect Calendar"}
        </Button>
    )
}
