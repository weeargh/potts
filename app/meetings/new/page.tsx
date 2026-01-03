import { AppLayout } from "@/components/app-layout"
import { CreateMeetingForm } from "@/components/create-meeting-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function NewMeetingPage() {
  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Create Meeting Bot</h1>
            <p className="text-sm text-muted-foreground">
              Join a meeting with Mekari Callnote and get AI-powered transcription
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Meeting Details</CardTitle>
              <CardDescription>
                Enter the meeting URL to create a bot that will join and record
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateMeetingForm />
            </CardContent>
          </Card>

          {/* Info Section */}
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-border bg-muted p-4">
              <h3 className="text-sm font-medium mb-2">How it works</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary">1.</span>
                  <span>
                    The bot joins your meeting with the name you specify
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">2.</span>
                  <span>
                    It records audio and video during the entire meeting
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">3.</span>
                  <span>
                    After the meeting ends, AI generates a transcript, summary, and action items
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-muted p-4">
              <h3 className="text-sm font-medium mb-2">Supported Platforms</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Google Meet</li>
                <li>• Zoom</li>
                <li>• Microsoft Teams</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
