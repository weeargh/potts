"use client"

import { useState } from "react"
import { Search, Plus, Volume2, ChevronDown, ChevronUp } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { MeetingListItem } from "@/components/meeting-list-item"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CalendarConnectButton } from "@/components/calendar-connect-button"
import { UpcomingEvents } from "@/components/upcoming-events"
import Link from "next/link"
import type { Meeting } from "@/lib/data/types"
import { getDateGroup } from "@/lib/utils"
import { useMeetings } from "@/lib/hooks/use-meetings"

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("all")

  const { meetings, isLoading: loading, mutate: reloadMeetings } = useMeetings()

  const [showUpcoming, setShowUpcoming] = useState(true)
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(true)
  const [showAll, setShowAll] = useState(false)

  // Filter by search query and status
  const filteredMeetings = meetings
    .filter((meeting) =>
      meeting.bot_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meeting.summary?.overview?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((meeting) => {
      // When showOnlyCompleted is true, only show completed meetings
      // When showOnlyCompleted is false (show all clicked), show completed and failed
      if (showOnlyCompleted) {
        return meeting.status === "completed"
      }
      return true // Show all statuses including failed, queued, etc.
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Limit to 5 meetings unless showAll is true
  const displayedMeetings = showAll ? filteredMeetings : filteredMeetings.slice(0, 5)

  // Group meetings by date
  const groupedMeetings = displayedMeetings.reduce((groups, meeting) => {
    const group = getDateGroup(meeting.created_at)
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(meeting)
    return groups
  }, {} as Record<string, Meeting[]>)

  // Define the order of date groups
  const dateGroupOrder = ["Today", "Yesterday", "This Week"]
  const orderedGroups = Object.keys(groupedMeetings).sort((a, b) => {
    const aIndex = dateGroupOrder.indexOf(a)
    const bIndex = dateGroupOrder.indexOf(b)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    // For month groups, sort by date descending
    return new Date(b).getTime() - new Date(a).getTime()
  })

  return (
    <AppLayout>
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-8 py-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Recordings</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage and search your meeting recordings</p>
          </div>
          <div className="flex items-center gap-3">
            <CalendarConnectButton />
            <Link href="/meetings/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Recording
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Upcoming Meetings Section - always shown, component handles empty state */}
      {/* Upcoming Meetings Section */}
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowUpcoming(!showUpcoming)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {showUpcoming ? <ChevronDown className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 -rotate-90" />}
            Upcoming Meetings
          </button>
        </div>

        {showUpcoming && (
          <div className="animate-in slide-in-from-top-2 duration-200">
            <UpcomingEvents onRefresh={reloadMeetings} />
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="border-b border-border px-8 py-4 bg-background">
        <div className="flex gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search meetings, transcripts..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            {["all", "recent", "shared", "archived"].map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedFilter === filter
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-border"
                  }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {/* Status Toggle and Show All */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyCompleted}
                onChange={(e) => setShowOnlyCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-muted-foreground">Only Completed</span>
            </label>
            {!showAll && filteredMeetings.length > 5 && (
              <button
                onClick={() => {
                  setShowAll(true)
                  setShowOnlyCompleted(false)
                }}
                className="text-sm text-primary hover:underline"
              >
                Show All ({filteredMeetings.length})
              </button>
            )}
            {showAll && (
              <button
                onClick={() => {
                  setShowAll(false)
                  setShowOnlyCompleted(true)
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Show Less
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Meetings List */}
      <div className="overflow-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading meetings...</p>
          </div>
        ) : filteredMeetings.length > 0 ? (
          <div className="flex flex-col">
            {orderedGroups.map((group) => (
              <div key={group}>
                {/* Date Group Header */}
                <div className="sticky top-0 z-10 bg-background border-b border-border px-8 py-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {group}
                  </h2>
                </div>

                {/* Meetings in this group */}
                <div className="divide-y divide-border">
                  {groupedMeetings[group]?.map((meeting) => (
                    <MeetingListItem key={meeting.bot_id} meeting={meeting} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <Volume2 className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {searchQuery ? "No meetings found. Try adjusting your search." : "No meetings yet. Create your first recording."}
            </p>
            {!searchQuery && (
              <Link href="/meetings/new">
                <Button className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Recording
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
