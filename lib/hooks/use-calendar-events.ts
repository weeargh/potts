import useSWR from 'swr'
import type { CalendarEvent } from "@/lib/api/meetingbaas"

const fetcher = (url: string) => fetch(url).then(r => r.json())

// 30 minutes in milliseconds - shorter cache for fresher data
const THIRTY_MINUTES = 30 * 60 * 1000

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
 * - Shows cached data immediately (stale-while-revalidate)
 * - Auto-revalidates every 30 minutes
 * - Revalidates on tab focus for fresh data
 * - Manual refresh available via mutate()
 */
export function useCalendarEvents(options?: { forceRefresh?: boolean }) {
    const url = options?.forceRefresh
        ? '/api/calendar/events?refresh=true'
        : '/api/calendar/events'

    const { data, error, isLoading, isValidating, mutate } = useSWR<CalendarEventsResponse>(
        url,
        fetcher,
        {
            // Revalidate on focus for fresh data when switching tabs
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            // Auto-refresh every 30 minutes
            refreshInterval: THIRTY_MINUTES,
            // Dedupe requests within 30 seconds
            dedupingInterval: 30000,
            // Keep previous data while loading new data
            keepPreviousData: true,
            // Retry on error
            errorRetryCount: 2,
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
