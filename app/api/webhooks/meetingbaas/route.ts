import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTranscript } from "@/lib/api/meetingbaas"
import { generateSummary, extractActionItems } from "@/lib/api/claude"
import { logger } from "@/lib/logger"

const CALLBACK_SECRET = process.env.MEETINGBAAS_CALLBACK_SECRET || ""
const webhookLogger = logger.child('webhook:meetingbaas')

/**
 * Callback/Webhook endpoint for MeetingBaas events
 * 
 * Currently configured for CALLBACKS (bot-specific, direct HTTP):
 * - Uses x-mb-secret header for verification
 * - Configured via callback_config when creating bots
 * - Receives: bot.completed, bot.failed, bot.status_change
 * 
 * Also handles CALENDAR WEBHOOKS (account-level):
 * - Calendar events: connection_created, connection_updated, connection_deleted,
 *   connection_error, events_synced, event_created, event_updated, event_cancelled
 * 
 * Note: If using account-level webhooks (via SVIX), would need to add SVIX signature
 * verification using svix-id, svix-timestamp, svix-signature headers.
 * 
 * Configure MEETINGBAAS_CALLBACK_URL in .env to point to this endpoint
 * e.g., https://your-domain.com/api/webhooks/meetingbaas
 */
export async function POST(request: NextRequest) {
    try {
        // Verify the callback secret is configured
        if (!CALLBACK_SECRET) {
            webhookLogger.error("MEETINGBAAS_CALLBACK_SECRET environment variable is not configured")
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
        }

        // Verify the callback secret
        const providedSecret = request.headers.get("x-mb-secret")
        if (providedSecret !== CALLBACK_SECRET) {
            webhookLogger.warn("Webhook request with invalid secret")
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const payload = await request.json()
        const event = payload.event as string
        const data = payload.data

        webhookLogger.info(`Webhook received: ${event}`, {
            bot_id: data?.bot_id,
            status: data?.status?.code || data?.error_code
        })

        switch (event) {
            // Bot events
            case "bot.completed":
                await handleBotCompleted(data)
                break

            case "bot.failed":
                await handleBotFailed(data)
                break

            case "bot.status_change":
                await handleStatusChange(data)
                break

            // Calendar events
            case "calendar.connection_created":
                await handleCalendarConnectionCreated(data)
                break

            case "calendar.connection_updated":
                await handleCalendarConnectionUpdated(data)
                break

            case "calendar.connection_deleted":
                await handleCalendarConnectionDeleted(data)
                break

            case "calendar.connection_error":
                await handleCalendarConnectionError(data)
                break

            case "calendar.events_synced":
                await handleCalendarEventsSynced(data)
                break

            case "calendar.event_created":
                await handleCalendarEventCreated(data)
                break

            case "calendar.event_updated":
                await handleCalendarEventUpdated(data)
                break

            case "calendar.event_cancelled":
                await handleCalendarEventCancelled(data)
                break

            default:
                webhookLogger.warn(`Unhandled webhook event: ${event}`)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        webhookLogger.error("Webhook processing failed", error instanceof Error ? error : undefined, {
            error: error instanceof Error ? error.message : String(error)
        })
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
    webhookLogger.info("Processing bot.completed event", { bot_id: data.bot_id })

    try {
        // 1. Find the existing meeting record
        const meeting = await prisma.meeting.findUnique({
            where: { botId: data.bot_id }
        })

        if (!meeting) {
            webhookLogger.error("Webhook received for unknown bot - meeting not found in database", undefined, {
                bot_id: data.bot_id,
                note: "Meeting should have been created in POST /api/bots"
            })
            return
        }

        // 2. Update meeting status in DB
        await prisma.meeting.update({
            where: { id: meeting.id },
            data: {
                status: "completed",
                durationSeconds: data.duration_seconds,
                videoUrl: data.mp4,
                audioUrl: data.audio,
                diarizationUrl: data.diarization,
                transcriptUrl: data.raw_transcription,
                completedAt: new Date(),
            }
        })

        // 2. Fetch and save transcript if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let utterances: any[] = []
        if (data.transcription) {
            webhookLogger.info("Fetching transcript", {
                bot_id: data.bot_id,
                transcript_url: data.transcription
            })
            utterances = await getTranscript(data.transcription)

            await prisma.transcript.upsert({
                where: { meetingId: meeting.id },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                update: { data: utterances as any },
                create: {
                    meetingId: meeting.id,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    data: utterances as any
                }
            })
            webhookLogger.info("Transcript saved to database", {
                bot_id: data.bot_id,
                utterance_count: utterances.length
            })
        }

        // 3. Generate and save summary/actions if we have transcript
        if (utterances.length > 0) {
            webhookLogger.info("Generating AI summary and action items", {
                bot_id: data.bot_id,
                utterance_count: utterances.length
            })
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
            webhookLogger.info("Summary and action items saved to database", {
                bot_id: data.bot_id,
                action_item_count: actionItems.length
            })
        }

    } catch (error) {
        webhookLogger.error("Error processing bot completion", error instanceof Error ? error : undefined, {
            bot_id: data.bot_id,
            error: error instanceof Error ? error.message : String(error)
        })
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
    webhookLogger.error("Bot failed", undefined, {
        bot_id: data.bot_id,
        error_code: data.error_code,
        error_message: data.error_message,
        extra: data.extra
    })

    // Update meeting status in database
    try {
        await prisma.meeting.update({
            where: { botId: data.bot_id },
            data: {
                status: "failed",
                errorCode: data.error_code,
                errorMessage: data.error_message,
            }
        })
        webhookLogger.info("Meeting marked as failed in database", { bot_id: data.bot_id })
    } catch (error) {
        webhookLogger.error("Failed to update meeting status", error instanceof Error ? error : undefined, {
            bot_id: data.bot_id
        })
    }

    // TODO: Implement user notification system
    // - Send email/push notification to user
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
    webhookLogger.debug("Bot status changed", {
        bot_id: data.bot_id,
        status_code: data.status?.code,
        timestamp: data.status?.created_at
    })

    // Update meeting status in database
    try {
        if (data.status?.code) {
            await prisma.meeting.update({
                where: { botId: data.bot_id },
                data: {
                    status: data.status.code,
                }
            })
        }
    } catch (error) {
        webhookLogger.warn("Failed to update meeting status", {
            bot_id: data.bot_id,
            error: error instanceof Error ? error.message : String(error)
        })
    }

    // TODO: Implement real-time status updates
    // - Update UI via websockets/SSE
    // - Push status to connected clients
}

// ============================================
// Calendar Webhook Handlers
// ============================================

/**
 * Handle calendar.connection_created event
 * Triggered when a new calendar connection is created
 */
async function handleCalendarConnectionCreated(data: {
    calendar_id: string
    platform: string
    account_email: string
    calendar_name?: string
}) {
    webhookLogger.info("Calendar connection created", {
        calendar_id: data.calendar_id,
        platform: data.platform,
        account_email: data.account_email
    })

    try {
        // Update calendar account with MeetingBaas calendar ID
        await prisma.calendarAccount.updateMany({
            where: {
                meetingbaasCalendarId: data.calendar_id
            },
            data: {
                isActive: true,
                updatedAt: new Date()
            }
        })
        webhookLogger.info("Calendar account updated with connection status", {
            calendar_id: data.calendar_id
        })
    } catch (error) {
        webhookLogger.error("Failed to update calendar connection", error instanceof Error ? error : undefined, {
            calendar_id: data.calendar_id
        })
    }
}

/**
 * Handle calendar.connection_updated event
 * Triggered when a calendar connection is updated (e.g., OAuth credentials refreshed)
 */
async function handleCalendarConnectionUpdated(data: {
    calendar_id: string
    platform: string
    status?: string
}) {
    webhookLogger.info("Calendar connection updated", {
        calendar_id: data.calendar_id,
        platform: data.platform,
        status: data.status
    })

    try {
        await prisma.calendarAccount.updateMany({
            where: {
                meetingbaasCalendarId: data.calendar_id
            },
            data: {
                isActive: data.status === "active",
                updatedAt: new Date()
            }
        })
    } catch (error) {
        webhookLogger.error("Failed to update calendar connection status", error instanceof Error ? error : undefined, {
            calendar_id: data.calendar_id
        })
    }
}

/**
 * Handle calendar.connection_deleted event
 * Triggered when a calendar connection is deleted
 */
async function handleCalendarConnectionDeleted(data: {
    calendar_id: string
    platform: string
}) {
    webhookLogger.info("Calendar connection deleted", {
        calendar_id: data.calendar_id,
        platform: data.platform
    })

    try {
        await prisma.calendarAccount.updateMany({
            where: {
                meetingbaasCalendarId: data.calendar_id
            },
            data: {
                isActive: false,
                updatedAt: new Date()
            }
        })
    } catch (error) {
        webhookLogger.error("Failed to mark calendar connection as deleted", error instanceof Error ? error : undefined, {
            calendar_id: data.calendar_id
        })
    }
}

/**
 * Handle calendar.connection_error event
 * Triggered when a calendar connection encounters an error
 */
async function handleCalendarConnectionError(data: {
    calendar_id: string
    platform: string
    error?: string
    status?: string
}) {
    webhookLogger.error("Calendar connection error", undefined, {
        calendar_id: data.calendar_id,
        platform: data.platform,
        error: data.error,
        status: data.status
    })

    try {
        await prisma.calendarAccount.updateMany({
            where: {
                meetingbaasCalendarId: data.calendar_id
            },
            data: {
                isActive: data.status === "active",
                updatedAt: new Date()
            }
        })
    } catch (error) {
        webhookLogger.error("Failed to update calendar connection error status", error instanceof Error ? error : undefined, {
            calendar_id: data.calendar_id
        })
    }

    // TODO: Notify user about connection error
    // - Send email/push notification
    // - Show in-app notification
}

/**
 * Handle calendar.events_synced event
 * Triggered after a calendar sync operation completes (initial sync)
 */
async function handleCalendarEventsSynced(data: {
    calendar_id: string
    events_synced?: number
    sync_type?: string
}) {
    webhookLogger.info("Calendar events synced", {
        calendar_id: data.calendar_id,
        events_synced: data.events_synced,
        sync_type: data.sync_type
    })

    // This is informational - no database update needed
    // The events themselves are handled by calendar.event_created/updated/cancelled webhooks
}

/**
 * Handle calendar.event_created event
 * Triggered when a new event is created in a connected calendar
 */
async function handleCalendarEventCreated(data: {
    calendar_id: string
    event_type: "one_off" | "recurring"
    series_id?: string
    series_bot_scheduled?: boolean
    instances?: Array<{
        event_id: string
        title: string
        start_time: string
        end_time: string
        meeting_url: string | null
        bot_scheduled?: boolean
    }>
}) {
    webhookLogger.info("Calendar event created", {
        calendar_id: data.calendar_id,
        event_type: data.event_type,
        series_id: data.series_id,
        instance_count: data.instances?.length
    })

    // TODO: Implement automatic bot scheduling if configured
    // - Check if user has auto-schedule enabled
    // - Schedule bots for events with meeting URLs
    // - Handle recurring events appropriately
}

/**
 * Handle calendar.event_updated event
 * Triggered when an existing event is updated in a connected calendar
 */
async function handleCalendarEventUpdated(data: {
    calendar_id: string
    event_type: "one_off" | "recurring"
    series_id?: string
    series_bot_scheduled?: boolean
    affected_instances?: Array<{
        event_id: string
        title: string
        start_time: string
        end_time: string
        meeting_url: string | null
        bot_scheduled?: boolean
    }>
}) {
    webhookLogger.info("Calendar event updated", {
        calendar_id: data.calendar_id,
        event_type: data.event_type,
        series_id: data.series_id,
        instance_count: data.affected_instances?.length
    })

    // TODO: Update bot schedules if meeting time/URL changed
    // - Check if bot is already scheduled for this event
    // - Update bot schedule if within lock window (>4 min before start)
    // - Create new bot if outside lock window
}

/**
 * Handle calendar.event_cancelled event
 * Triggered when an event is cancelled in a connected calendar
 */
async function handleCalendarEventCancelled(data: {
    calendar_id: string
    event_type: "one_off" | "recurring"
    series_id?: string
    series_bot_scheduled?: boolean
    cancelled_instances?: Array<{
        event_id: string
        title: string
        start_time: string
    }>
}) {
    webhookLogger.info("Calendar event cancelled", {
        calendar_id: data.calendar_id,
        event_type: data.event_type,
        series_id: data.series_id,
        instance_count: data.cancelled_instances?.length
    })

    // TODO: Cancel scheduled bots for cancelled events
    // - Find meetings linked to these event IDs
    // - Cancel scheduled bots if they haven't started yet
    // - Leave active bots if they're already in the meeting
}
