"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function CreateMeetingForm() {
  const router = useRouter()
  const [meetingUrl, setMeetingUrl] = useState("")
  const [botName, setBotName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meeting_url: meetingUrl,
          bot_name: botName || "Notula",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create bot")
      }

      const data = await response.json()
      router.push(`/meetings/${data.bot_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="meeting-url">Meeting URL</Label>
        <Input
          id="meeting-url"
          type="url"
          placeholder="https://meet.google.com/xxx-yyyy-zzz"
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Google Meet, Zoom, or Microsoft Teams URL
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bot-name">Bot Name</Label>
        <Input
          id="bot-name"
          type="text"
          placeholder="Notula"
          value={botName}
          onChange={(e) => setBotName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Optional: Custom name for your meeting bot
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Creating Bot..." : "Create Meeting Bot"}
      </Button>
    </form>
  )
}
