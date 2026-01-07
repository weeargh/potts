import useSWR from 'swr'
import type { CalendarEvent } from "@/lib/api/meetingbaas"
import { SWR_LIST_CONFIG } from './swr-config'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// 5 minutes in milliseconds - auto-refresh interval
const FIVE_MINUTES = 5 * 60 * 1000

interface CalendarEventsResponse {
    events: CalendarEvent[]
    calendars: Array<{
        uuid: string
        email: string
        name: string
    }>
    message?: string
    error?: string
}

/**
 * Hook for fetching calendar events with SWR caching
 *
 * Uses standardized SWR config for consistent behavior.
 * Auto-refreshes every 5 minutes to keep data fresh.
 */
export function useCalendarEvents(options?: { forceRefresh?: boolean }) {
    const url = options?.forceRefresh
        ? '/api/calendar/events?refresh=true'
        : '/api/calendar/events'

    const { data, error, isLoading, isValidating, mutate } = useSWR<CalendarEventsResponse>(
        url,
        fetcher,
        {
            ...SWR_LIST_CONFIG,
            // Auto-refresh every 5 minutes for calendar freshness
            refreshInterval: FIVE_MINUTES,
        }
    )

    // Manual refresh function - forces API call
    const refresh = async () => {
        // Fetch with refresh=true to bypass server cache
        const freshData = await fetch('/api/calendar/events?refresh=true').then(r => r.json())
        // Update SWR cache with fresh data
        mutate(freshData, false)
        return freshData
    }

    return {
        events: data?.events || [],
        calendars: data?.calendars || [],
        isLoading,
        isValidating, // true when revalidating in background
        isError: error,
        message: data?.message,
        mutate,
        refresh, // Manual refresh function
    }
}
