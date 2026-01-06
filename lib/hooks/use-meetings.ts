
import useSWR from 'swr'
import type { Meeting, TranscriptUtterance, AISummary, ActionItem } from "@/lib/data/types"

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
    const { data, error, isLoading, mutate } = useSWR<MeetingsResponse>(url, fetcher)

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
        {
            keepPreviousData: true,
            revalidateOnFocus: false,
        }
    )

    return {
        meeting: data,
        isLoading,
        isError: error,
        mutate,
    }
}
