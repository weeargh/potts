"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Download, Share2, MoreVertical, ChevronDown, Send, BookOpen, Play } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AppLayout } from "@/components/app-layout"
import { formatDate } from "@/lib/utils"
import { useMeeting } from "@/lib/hooks/use-meetings"

interface MeetingPageProps {
  params: Promise<{ id: string }>
}

export default function MeetingPage({ params }: MeetingPageProps) {
  const [id, setId] = useState<string>("")

  // Unpack params
  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  const { meeting, isLoading } = useMeeting(id || null)

  const [expandedTranscript, setExpandedTranscript] = useState(false)
  const [aiQuestion, setAiQuestion] = useState("")

  if (isLoading || !meeting) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading meeting...</p>
        </div>
      </AppLayout>
    )
  }

  const utterances = meeting.utterances || []
  const summary = meeting.summary
  const actionItems = meeting.actionItems || []

  return (
    <AppLayout>
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="px-8 py-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-4 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Recordings
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-3">{meeting.bot_name}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{formatDate(meeting.created_at)}</span>
                <span>•</span>
                <span>{meeting.duration_seconds ? `${Math.floor(meeting.duration_seconds / 60)}m` : "In progress"}</span>
                <span>•</span>
                <span>{meeting.participants?.length || 0} participants</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
              <Button variant="outline" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content - Two Column Layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Summary, Insights, ToDos, Q&A, Transcript */}
        <div className="flex-1 overflow-y-auto bg-background p-8">
          <div className="max-w-2xl space-y-6">
            {/* Summary Card */}
            <section className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
                Meeting Summary
              </h2>
              {summary?.overview ? (
                <p className="text-sm text-foreground leading-relaxed">{summary.overview}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {meeting.status === "completed" ? "Processing AI summary..." : "Summary will be available after the meeting completes"}
                </p>
              )}
            </section>

            {/* Key Topics */}
            {summary?.keyPoints && summary.keyPoints.length > 0 && (
              <section className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
                  Key Points
                </h2>
                <div className="flex flex-wrap gap-2">
                  {summary.keyPoints.map((point, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-full"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Action Items / To-Do */}
            <section className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
                Action Items
              </h2>
              {actionItems.length > 0 ? (
                <div className="space-y-3">
                  {actionItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 pb-3 border-b border-border last:pb-0 last:border-0"
                    >
                      <input type="checkbox" className="mt-1 w-4 h-4 rounded" defaultChecked={item.completed} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium">{item.description}</p>
                        {item.assignee && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{item.assignee}</span>
                            {item.dueDate && (
                              <>
                                <span>•</span>
                                <span>Due {item.dueDate}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {meeting.status === "completed" ? "No action items found in this meeting" : "Action items will be extracted after the meeting"}
                </p>
              )}
            </section>

            {/* AI Q&A Section */}
            <section className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
                Ask AI about this meeting
              </h2>
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="What were the main decisions made?"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    className="w-full px-4 py-3 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80 transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </section>

            {/* Transcript - Collapsible */}
            <section className="bg-card border border-border rounded-lg p-6">
              <button
                onClick={() => setExpandedTranscript(!expandedTranscript)}
                className="w-full flex items-center justify-between mb-4 hover:opacity-80 transition-opacity"
              >
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Full Transcript</h2>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${expandedTranscript ? "rotate-180" : ""}`}
                />
              </button>

              {expandedTranscript && (
                <div className="space-y-4 border-t border-border pt-4">
                  {utterances.length > 0 ? (
                    utterances.map((entry, idx) => {
                      const speaker = typeof entry.speaker === "number" ? `Speaker ${entry.speaker}` : entry.speaker
                      const text = entry.text || entry.words?.map(w => w.text).join(" ") || ""
                      const timestamp = entry.start ? `${Math.floor(entry.start / 60)}:${String(Math.floor(entry.start % 60)).padStart(2, "0")}` : ""

                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-primary">{speaker}</span>
                            {timestamp && <span className="text-xs text-muted-foreground">{timestamp}</span>}
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{text}</p>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {meeting.status === "in_call_recording" ? "Recording in progress..." : "Processing transcript..."}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Right: Video Player (Secondary) */}
        <div className="w-96 border-l border-border bg-background flex flex-col p-8">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="aspect-video bg-black/90 relative group">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3 cursor-pointer hover:bg-primary/90 transition-colors">
                    <Play className="w-6 h-6 text-primary-foreground fill-current ml-1" />
                  </div>
                  <p className="text-xs text-muted-foreground">Video Recording</p>
                </div>
              </div>
            </div>

            {/* Video Info */}
            <div className="p-6 border-t border-border space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Duration</p>
                <p className="text-sm font-semibold text-foreground">
                  {meeting.duration_seconds ? `${Math.floor(meeting.duration_seconds / 60)}m ${meeting.duration_seconds % 60}s` : "In progress"}
                </p>
              </div>
              {meeting.video && (
                <a href={meeting.video} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <BookOpen className="w-4 h-4" />
                    View Recording
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
