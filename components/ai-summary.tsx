import type { AISummary } from "@/lib/data/types"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface AISummaryProps {
  summary: AISummary
  className?: string
}

export function AISummaryCard({ summary, className }: AISummaryProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Meeting Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-2">Overview</h4>
          <p className="text-sm text-muted-foreground">{summary.overview}</p>
        </div>

        {summary.keyPoints.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Key Discussion Points</h4>
            <ul className="space-y-1">
              {summary.keyPoints.map((point, index) => (
                <li key={index} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.decisions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Decisions Made</h4>
            <ul className="space-y-1">
              {summary.decisions.map((decision, index) => (
                <li key={index} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.nextSteps.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Next Steps</h4>
            <ul className="space-y-1">
              {summary.nextSteps.map((step, index) => (
                <li key={index} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
