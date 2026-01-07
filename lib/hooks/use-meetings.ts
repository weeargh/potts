
import useSWR from 'swr'
import type { Meeting, TranscriptUtterance, AISummary, ActionItem } from "@/lib/data/types"
import { SWR_LIST_CONFIG, SWR_DETAIL_CONFIG } from './swr-config'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface MeetingsResponse {
    bots: Meeting[]
    pagination?: {
        nextCursor: string | null
        hasMore: boolean
        limit: number
    }
}

export function useMeetings(limit?: number) {
    const url = limit ? `/api/bots?limit=${limit}` : '/api/bots'
    const { data, error, isLoading, mutate } = useSWR<MeetingsResponse>(
        url,
        fetcher,
        SWR_LIST_CONFIG
    )

    return {
        meetings: data?.bots || [],
        pagination: data?.pagination,
        isLoading,
        isError: error,
        mutate,
    }
}

export interface MeetingDetail extends Meeting {
    utterances?: TranscriptUtterance[]
    summary?: AISummary
    actionItems?: ActionItem[]
}

export function useMeeting(id: string | null) {
    const { data, error, isLoading, mutate } = useSWR<MeetingDetail>(
        id ? `/api/bots/${id}` : null,
        fetcher,
        SWR_DETAIL_CONFIG
    )

    return {
        meeting: data,
        isLoading,
        isError: error,
        mutate,
    }
}
