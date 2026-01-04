import { NextRequest, NextResponse } from "next/server"

const CALLBACK_SECRET = process.env.MEETINGBAAS_CALLBACK_SECRET || ""

/**
 * Webhook endpoint to receive MeetingBaas bot.completed and bot.failed callbacks
 * Configure MEETINGBAAS_CALLBACK_URL in .env to point to this endpoint
 * e.g., https://your-domain.com/api/webhooks/meetingbaas
 */
export async function POST(request: NextRequest) {
    try {
        // Verify the callback secret if configured
        if (CALLBACK_SECRET) {
            const providedSecret = request.headers.get("x-mb-secret")
            if (providedSecret !== CALLBACK_SECRET) {
                console.error("MeetingBaas webhook: Invalid secret")
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }
        }

        const payload = await request.json()
        const event = payload.event as string
        const data = payload.data

        console.log(`MeetingBaas webhook received: ${event}`, {
            bot_id: data?.bot_id,
            status: data?.status?.code || data?.error_code
        })

        switch (event) {
            case "bot.completed":
                await handleBotCompleted(data)
                break

            case "bot.failed":
                await handleBotFailed(data)
                break

            case "bot.status_change":
                await handleStatusChange(data)
                break

            default:
                console.log(`Unhandled webhook event: ${event}`)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("MeetingBaas webhook error:", error)
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 500 }
        )
    }
}

/**
 * Handle bot.completed event
 * Called when a bot finishes recording and transcription
 */
async function handleBotCompleted(data: {
    bot_id: string
    transcription?: string
    raw_transcription?: string
    mp4?: string
    audio?: string
    diarization?: string
    duration_seconds?: number
    participants?: string[]
    speakers?: string[]
    extra?: Record<string, unknown>
}) {
    console.log("Bot completed:", data.bot_id)

    // The raw_transcription URL contains Gladia's summarization output
    // You can fetch it here if needed for additional processing
    if (data.raw_transcription) {
        console.log("Raw transcription available (includes Gladia summary)")
    }

    // TODO: Implement your business logic here
    // - Update database with meeting completion
    // - Send notifications to users
    // - Trigger downstream processing
}

/**
 * Handle bot.failed event
 * Called when a bot fails for any reason
 */
async function handleBotFailed(data: {
    bot_id: string
    error_code?: string
    error_message?: string
    extra?: Record<string, unknown>
}) {
    console.error("Bot failed:", data.bot_id, data.error_code, data.error_message)

    // TODO: Implement your error handling logic
    // - Log the error for monitoring
    // - Notify users of the failure
    // - Retry if appropriate (e.g., for TRANSCRIPTION_FAILED)
}

/**
 * Handle bot.status_change event
 * Called when bot transitions between states
 */
async function handleStatusChange(data: {
    bot_id: string
    status?: { code: string; created_at: string }
    extra?: Record<string, unknown>
}) {
    console.log("Bot status changed:", data.bot_id, data.status?.code)

    // TODO: Implement real-time status updates
    // - Update UI via websockets/SSE
    // - Update database with current status
}
