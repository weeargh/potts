
import useSWR from 'swr'
import type { Meeting, TranscriptUtterance, AISummary, ActionItem } from "@/lib/data/types"

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useMeetings() {
    const { data, error, isLoading, mutate } = useSWR<{ bots: Meeting[] }>('/api/bots', fetcher)

    return {
        meetings: data?.bots || [],
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
        fetcher
    )

    return {
        meeting: data,
        isLoading,
        isError: error,
        mutate,
    }
}
