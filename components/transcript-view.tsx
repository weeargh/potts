import type { TranscriptUtterance } from "@/lib/data/types"
import { cn } from "@/lib/utils"

export interface TranscriptViewProps {
  utterances: TranscriptUtterance[]
  className?: string
}

export function TranscriptView({ utterances, className }: TranscriptViewProps) {
  if (utterances.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <p className="text-sm text-muted-foreground">
          No transcript available yet
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {utterances.map((utterance, index) => {
        const speaker =
          typeof utterance.speaker === "number"
            ? `Speaker ${utterance.speaker}`
            : utterance.speaker
        const text =
          utterance.text || utterance.words?.map((w) => w.text).join(" ") || ""

        return (
          <div key={index} className="flex gap-3">
            <div className="flex-shrink-0">
              <div className="rounded-full bg-muted size-8 flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {speaker.charAt(speaker.length - 1)}
                </span>
              </div>
            </div>
            <div className="flex-1 pt-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{speaker}</span>
                {utterance.start !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {Math.floor(utterance.start / 60)}:
                    {String(Math.floor(utterance.start % 60)).padStart(2, "0")}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground">{text}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
