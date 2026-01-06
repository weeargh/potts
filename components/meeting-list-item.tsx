import Link from "next/link"
import { Clock, Users, ChevronRight } from "lucide-react"
import type { Meeting } from "@/lib/data/types"
import { cn, formatTime, formatDuration } from "@/lib/utils"
import { StatusBadge } from "./status-badge"

export interface MeetingListItemProps {
  meeting: Meeting
  className?: string
}

export function MeetingListItem({ meeting, className }: MeetingListItemProps) {
  return (
    <Link href={`/meetings/${meeting.bot_id}`}>
      <div
        className={cn(
          "flex items-center gap-3 md:gap-4 px-4 md:px-6 py-4 hover:bg-muted/30 transition-colors cursor-pointer group",
          className
        )}
      >
        {/* Time */}
        <div className="flex flex-col items-start min-w-[60px] md:min-w-[80px]">
          <span className="text-sm font-medium text-foreground">{formatTime(meeting.created_at)}</span>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 mb-1">
            <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{meeting.bot_name}</h3>
            <StatusBadge status={meeting.status} />
          </div>

          {meeting.summary?.overview && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {meeting.summary.overview}
            </p>
          )}
        </div>

        {/* Metadata */}
        <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
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
        <ChevronRight className="size-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  )
}
