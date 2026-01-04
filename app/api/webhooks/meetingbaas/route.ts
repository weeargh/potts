import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTranscript } from "@/lib/api/meetingbaas"
import { generateSummary, extractActionItems } from "@/lib/api/claude"
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

    try {
        // 1. Update meeting status in DB
        const meeting = await prisma.meeting.upsert({
            where: { botId: data.bot_id },
            update: {
                status: "completed",
                durationSeconds: data.duration_seconds,
                videoUrl: data.mp4,
                audioUrl: data.audio,
                diarizationUrl: data.diarization, // Save diarization URL
                transcriptUrl: data.raw_transcription, // Save raw transcript URL
                completedAt: new Date(),
            },
            create: {
                // Fallback creation if not exists (should rarely happen if created via API)
                botId: data.bot_id,
                userId: "00000000-0000-0000-0000-000000000000", // Placeholder if unknown
                user: { connect: { email: "unknown@example.com" } }, // This might fail, ideally we find user ownership earlier
                botName: "Unknown Meeting",
                meetingUrl: "unknown",
                status: "completed",
            }
        }).catch(err => {
            console.error("Failed to upsert meeting:", err)
            return null
        })

        if (!meeting) {
            console.error("Could not find or create meeting for bot:", data.bot_id)
            return
        }

        // 2. Fetch and save transcript if available
        let utterances: any[] = []
        if (data.transcription) {
            console.log("Fetching transcript from:", data.transcription)
            utterances = await getTranscript(data.transcription)

            await prisma.transcript.upsert({
                where: { meetingId: meeting.id },
                update: { data: utterances as any },
                create: {
                    meetingId: meeting.id,
                    data: utterances as any
                }
            })
            console.log("Transcript saved to DB")
        }

        // 3. Generate and save summary/actions if we have transcript
        if (utterances.length > 0) {
            console.log("Generating summary and action items...")
            const [summary, actionItems] = await Promise.all([
                generateSummary(utterances),
                extractActionItems(utterances)
            ])

            // Save Summary
            await prisma.summary.upsert({
                where: { meetingId: meeting.id },
                update: {
                    overview: summary.overview,
                    keyPoints: summary.keyPoints,
                    decisions: summary.decisions,
                    nextSteps: summary.nextSteps,
                },
                create: {
                    meetingId: meeting.id,
                    overview: summary.overview,
                    keyPoints: summary.keyPoints,
                    decisions: summary.decisions,
                    nextSteps: summary.nextSteps,
                }
            })

            // Save Action Items
            // Delete existing to avoid duplicates on retry
            await prisma.actionItem.deleteMany({
                where: { meetingId: meeting.id }
            })

            if (actionItems.length > 0) {
                await prisma.actionItem.createMany({
                    data: actionItems.map(item => ({
                        meetingId: meeting.id,
                        description: item.description,
                        assignee: item.assignee,
                        dueDate: item.dueDate,
                        completed: item.completed
                    }))
                })
            }
            console.log("Summary and action items saved to DB")
        }

    } catch (error) {
        console.error("Error processing bot completion:", error)
        // Don't throw, we want to return 200 OK to the webhook
    }
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
