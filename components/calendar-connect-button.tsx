"use client"

import { useState, useEffect } from "react"
import { Calendar, Loader2, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CalendarConnectButtonProps {
    onConnected?: () => void
}

export function CalendarConnectButton({ onConnected }: CalendarConnectButtonProps) {
    const [isConnected, setIsConnected] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isConnecting, setIsConnecting] = useState(false)

    useEffect(() => {
        // Check if calendar is connected
        async function checkConnection() {
            try {
                const response = await fetch("/api/calendar/events")
                const data = await response.json()
                setIsConnected(data.calendars && data.calendars.length > 0)
            } catch {
                setIsConnected(false)
            } finally {
                setIsLoading(false)
            }
        }

        // Check URL params for connection status
        const params = new URLSearchParams(window.location.search)
        if (params.get("calendar_connected") === "true") {
            setIsConnected(true)
            setIsLoading(false)
            onConnected?.()
            // Clean up URL
            window.history.replaceState({}, "", window.location.pathname)
        } else {
            checkConnection()
        }
    }, [onConnected])

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

    if (isConnected) {
        return (
            <Button variant="outline" className="gap-2 text-green-600 border-green-200 hover:bg-green-50">
                <CheckCircle className="w-4 h-4" />
                Calendar Connected
            </Button>
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
