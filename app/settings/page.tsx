"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { Button } from "@/components/ui/button"
import { Calendar, Plus, Trash2, Loader2, Mail, CheckCircle, AlertCircle } from "lucide-react"

interface ConnectedCalendar {
    uuid: string
    email: string
    name: string
    status?: string
    synced_at?: string
}

export default function SettingsPage() {
    const [calendars, setCalendars] = useState<ConnectedCalendar[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isConnecting, setIsConnecting] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const fetchCalendars = async () => {
        try {
            const response = await fetch("/api/calendar/events")
            const data = await response.json()
            if (data.calendars) {
                setCalendars(data.calendars)
            }
        } catch {
            setError("Failed to load calendars")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchCalendars()

        // Check for success message from redirect
        const params = new URLSearchParams(window.location.search)
        if (params.get("calendar_connected") === "true") {
            setSuccess("Calendar connected successfully!")
            window.history.replaceState({}, "", window.location.pathname)
            setTimeout(() => setSuccess(null), 5000)
        }
    }, [])

    const handleConnect = () => {
        setIsConnecting(true)
        setError(null)
        // Redirect to calendar OAuth flow
        window.location.href = "/api/calendar/connect"
    }

    const handleDisconnect = async (calendarId: string, email: string) => {
        if (!confirm(`Are you sure you want to disconnect ${email}? Bot scheduling for this calendar will stop.`)) {
            return
        }

        setDeletingId(calendarId)
        setError(null)

        try {
            const response = await fetch(`/api/calendar/${calendarId}`, {
                method: "DELETE"
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || "Failed to disconnect calendar")
            }

            setCalendars(calendars.filter(c => c.uuid !== calendarId))
            setSuccess(`${email} disconnected successfully`)
            setTimeout(() => setSuccess(null), 5000)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to disconnect calendar")
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <AppLayout>
            {/* Header */}
            <div className="border-b border-border bg-card">
                <div className="px-8 py-6">
                    <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage your account and connected services</p>
                </div>
            </div>

            <div className="p-8 max-w-3xl">
                {/* Success/Error Messages */}
                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-800">
                        <CheckCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{success}</span>
                    </div>
                )}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-800">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Calendar Connections Section */}
                <section className="bg-card border border-border rounded-lg">
                    <div className="px-6 py-4 border-b border-border">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Calendar className="w-5 h-5 text-primary" />
                                <div>
                                    <h2 className="text-lg font-semibold">Connected Calendars</h2>
                                    <p className="text-sm text-muted-foreground">
                                        Bots will automatically join meetings from connected calendars
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={handleConnect}
                                disabled={isConnecting}
                                className="gap-2"
                            >
                                {isConnecting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Plus className="w-4 h-4" />
                                )}
                                {isConnecting ? "Connecting..." : "Add Calendar"}
                            </Button>
                        </div>
                    </div>

                    <div className="divide-y divide-border">
                        {isLoading ? (
                            <div className="px-6 py-8 text-center">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Loading calendars...</p>
                            </div>
                        ) : calendars.length === 0 ? (
                            <div className="px-6 py-8 text-center">
                                <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                                <p className="text-muted-foreground mb-4">No calendars connected</p>
                                <p className="text-sm text-muted-foreground">
                                    Connect your Google Calendar to automatically record meetings
                                </p>
                            </div>
                        ) : (
                            calendars.map((calendar) => (
                                <div
                                    key={calendar.uuid}
                                    className="px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Mail className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground">{calendar.email}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Google Calendar
                                                {calendar.status && (
                                                    <span className="ml-2 text-green-600">
                                                        • Active
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDisconnect(calendar.uuid, calendar.email)}
                                        disabled={deletingId === calendar.uuid}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        {deletingId === calendar.uuid ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                        <span className="ml-2">Disconnect</span>
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>

                    {calendars.length > 0 && (
                        <div className="px-6 py-3 bg-muted/30 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                                {calendars.length} calendar{calendars.length !== 1 ? "s" : ""} connected.
                                Meetings with video conferencing links will be automatically recorded.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    )
}
