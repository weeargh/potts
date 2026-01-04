import type { BotStatus } from "@/lib/data/types"
import { cn } from "@/lib/utils"

export interface StatusBadgeProps {
  status: BotStatus
  className?: string
}

const statusConfig: Record<
  BotStatus,
  { label: string; dotColor: string; textColor: string; bgColor: string; borderColor: string }
> = {
  queued: {
    label: "Queued",
    dotColor: "bg-zinc-600",
    textColor: "text-zinc-700",
    bgColor: "bg-zinc-50",
    borderColor: "border-zinc-200",
  },
  joining_call: {
    label: "Joining",
    dotColor: "bg-yellow-600",
    textColor: "text-yellow-700",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
  },
  in_waiting_room: {
    label: "Waiting",
    dotColor: "bg-orange-600",
    textColor: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  in_call_not_recording: {
    label: "In Call",
    dotColor: "bg-cyan-600",
    textColor: "text-cyan-700",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
  },
  in_call_recording: {
    label: "Recording",
    dotColor: "bg-teal-600",
    textColor: "text-teal-700",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
  },
  recording_paused: {
    label: "Paused",
    dotColor: "bg-amber-600",
    textColor: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  recording_resumed: {
    label: "Recording",
    dotColor: "bg-teal-600",
    textColor: "text-teal-700",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
  },
  transcribing: {
    label: "Transcribing",
    dotColor: "bg-purple-600",
    textColor: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  completed: {
    label: "Completed",
    dotColor: "bg-blue-600",
    textColor: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  failed: {
    label: "Failed",
    dotColor: "bg-red-600",
    textColor: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.queued

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.textColor,
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <span className={cn("inline-block size-1.5 rounded-full", config.dotColor)} />
      <span>{config.label}</span>
    </div>
  )
}
