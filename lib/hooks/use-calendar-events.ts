import useSWR from 'swr'
import type { CalendarEvent } from "@/lib/api/meetingbaas"

const fetcher = (url: string) => fetch(url).then(r => r.json())

// 4 hours in milliseconds
const FOUR_HOURS = 4 * 60 * 60 * 1000

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
 * - Auto-revalidates every 4 hours
 * - Manual refresh available via mutate()
 * - Dedupes requests within 1 minute
 */
export function useCalendarEvents(options?: { forceRefresh?: boolean }) {
    const url = options?.forceRefresh
        ? '/api/calendar/events?refresh=true'
        : '/api/calendar/events'

    const { data, error, isLoading, isValidating, mutate } = useSWR<CalendarEventsResponse>(
        url,
        fetcher,
        {
            // Show stale data immediately, revalidate in background
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            // Auto-refresh every 4 hours
            refreshInterval: FOUR_HOURS,
            // Dedupe requests within 1 minute
            dedupingInterval: 60000,
            // Keep previous data while loading new data
            keepPreviousData: true,
            // Don't retry on error (to avoid hammering the API)
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
