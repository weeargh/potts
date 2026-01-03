import Link from "next/link"
import { Clock, Users, Video } from "lucide-react"
import type { Meeting } from "@/lib/data/types"
import { formatDate, formatDuration } from "@/lib/utils"
import { StatusBadge } from "./status-badge"

export interface MeetingCardGridProps {
  meeting: Meeting
  className?: string
}

export function MeetingCardGrid({ meeting, className }: MeetingCardGridProps) {
  return (
    <Link href={`/meetings/${meeting.bot_id}`}>
      <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all hover:border-primary/50 cursor-pointer h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate mb-1">
              {meeting.bot_name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {formatDate(meeting.created_at)}
            </p>
          </div>
          <StatusBadge status={meeting.status} />
        </div>

        {/* Summary Preview */}
        {meeting.summary?.overview && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
            {meeting.summary.overview}
          </p>
        )}

        {/* Footer Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-4 border-t border-border">
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

          {meeting.video && (
            <div className="flex items-center gap-1.5">
              <Video className="size-3.5" />
              <span>Recorded</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
