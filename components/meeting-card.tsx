import Link from "next/link"
import { Clock, Users } from "lucide-react"
import type { Meeting } from "@/lib/data/types"
import { cn, formatDate, formatDuration } from "@/lib/utils"
import { StatusBadge } from "./status-badge"

export interface MeetingCardProps {
  meeting: Meeting
  className?: string
}

export function MeetingCard({ meeting, className }: MeetingCardProps) {
  return (
    <Link href={`/meetings/${meeting.bot_id}`}>
      <div
        className={cn(
          "rounded-2xl border border-border bg-background p-4 hover:shadow-lg/5 transition-shadow",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <StatusBadge status={meeting.status} />
          <span className="text-xs text-muted-foreground">
            {formatDate(meeting.created_at)}
          </span>
        </div>

        {/* Content */}
        <h3 className="text-[15px] font-semibold leading-6 mb-2">
          {meeting.bot_name}
        </h3>

        {meeting.summary?.overview && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {meeting.summary.overview}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {meeting.duration_seconds !== null && (
            <div className="flex items-center gap-2">
              <Clock className="size-4" />
              <span>{formatDuration(meeting.duration_seconds)}</span>
            </div>
          )}

          {meeting.participants && meeting.participants.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="size-4" />
              <span>{meeting.participants.length} participants</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
