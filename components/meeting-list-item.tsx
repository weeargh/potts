import Link from "next/link"
import { Clock, Users, ChevronRight } from "lucide-react"
import type { Meeting } from "@/lib/data/types"
import { cn, formatDuration } from "@/lib/utils"
import { StatusBadge } from "./status-badge"

export interface MeetingListItemProps {
  meeting: Meeting
  className?: string
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return "Today"
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday"
  }
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function MeetingListItem({ meeting, className }: MeetingListItemProps) {
  return (
    <Link href={`/meetings/${meeting.bot_id}`} prefetch={true}>
      <div
        className={cn(
          "flex items-center gap-4 py-3 px-4 hover:bg-muted/30 transition-colors cursor-pointer group",
          className
        )}
      >
        {/* Time Column - Fixed Width (matches upcoming events) */}
        <div className="w-24 shrink-0 flex flex-col justify-center">
          <span className="text-sm font-medium text-foreground">
            {formatTime(meeting.created_at)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(meeting.created_at)}
          </span>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {meeting.bot_name}
            </h3>
            <StatusBadge status={meeting.status} />
          </div>

          {/* Summary - grey, smaller text */}
          {meeting.summary?.overview && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {meeting.summary.overview}
            </p>
          )}
        </div>

        {/* Metadata */}
        <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          {meeting.duration_seconds !== null && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              <span>{formatDuration(meeting.duration_seconds)}</span>
            </div>
          )}

          {meeting.participants && meeting.participants.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              <span>{meeting.participants.length}</span>
            </div>
          )}
        </div>

        {/* Arrow */}
        <ChevronRight className="size-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
      </div>
    </Link>
  )
}
