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
  in_waiting_room: {
    label: "Waiting",
    dotColor: "bg-orange-600",
    textColor: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  in_meeting: {
    label: "Recording",
    dotColor: "bg-teal-600",
    textColor: "text-teal-700",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
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
