/**
 * Shared SWR configuration for consistent caching behavior
 * 
 * This provides standardized caching settings across all data hooks
 * for predictable performance and data freshness.
 */

import type { SWRConfiguration } from 'swr'

/**
 * Default SWR config for list data (meetings, events, etc.)
 * - 5s deduplication to prevent rapid re-fetches
 * - 30s throttle on focus to reduce API load
 * - Auto-refresh on tab focus for fresh data
 */
export const SWR_LIST_CONFIG: SWRConfiguration = {
    dedupingInterval: 5000,         // Don't refetch within 5s
    focusThrottleInterval: 30000,   // Only refetch on focus every 30s
    revalidateOnFocus: true,        // Refresh when user returns to tab
    revalidateOnReconnect: true,    // Refresh when network reconnects
    keepPreviousData: true,         // Show stale data while loading
    errorRetryCount: 2,             // Retry failed requests twice
}

/**
 * SWR config for detail pages (single meeting, etc.)
 * - Less aggressive revalidation since data changes rarely
 */
export const SWR_DETAIL_CONFIG: SWRConfiguration = {
    dedupingInterval: 10000,        // Don't refetch within 10s
    revalidateOnFocus: false,       // Don't revalidate on focus (data rarely changes)
    keepPreviousData: true,
    errorRetryCount: 2,
}

/**
 * SWR config for settings/config data
 * - Longer dedupe since settings change rarely
 */
export const SWR_SETTINGS_CONFIG: SWRConfiguration = {
    dedupingInterval: 30000,        // Don't refetch within 30s
    revalidateOnFocus: false,       // Settings rarely change
    keepPreviousData: true,
    errorRetryCount: 1,
}
