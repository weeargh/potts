import type { ActionItem } from "@/lib/data/types"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckSquare, Square } from "lucide-react"

export interface ActionItemsListProps {
  actionItems: ActionItem[]
  className?: string
}

export function ActionItemsList({ actionItems, className }: ActionItemsListProps) {
  if (actionItems.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Action Items</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No action items identified in this meeting
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Action Items</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {actionItems.map((item) => (
            <li key={item.id} className="flex gap-3">
              <div className="flex-shrink-0 pt-0.5">
                {item.completed ? (
                  <CheckSquare className="size-4 text-primary" />
                ) : (
                  <Square className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm text-foreground">{item.description}</p>
                <div className="flex gap-3 mt-1">
                  {item.assignee && (
                    <span className="text-xs text-muted-foreground">
                      @{item.assignee}
                    </span>
                  )}
                  {item.dueDate && (
                    <span className="text-xs text-muted-foreground">
                      Due: {item.dueDate}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
