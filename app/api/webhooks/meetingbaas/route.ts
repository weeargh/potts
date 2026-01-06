import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTranscript, scheduleCalendarBot, getBotStatus, cancelScheduledBot } from "@/lib/api/meetingbaas"
import { generateMeetingAIContent } from "@/lib/ai/generate"
import { logger } from "@/lib/logger"
import { Webhook } from "svix"

const CALLBACK_SECRET = process.env.MEETINGBAAS_CALLBACK_SECRET || ""
const SVIX_SECRET = process.env.MEETINGBAAS_SVIX_SECRET || ""
const webhookLogger = logger.child('webhook:meetingbaas')

/**
 * Webhook endpoint for MeetingBaas events
 *
 * This is the SINGLE ENTRY POINT for processing meeting data.
 * All content (transcripts, diarization, summaries, action items) is stored
 * in Supabase immediately when received, before MeetingBaas URLs expire.
 *
 * Supports TWO authentication methods:
 * 1. Per-bot callbacks: x-mb-secret header (for bot.completed, bot.failed)
 * 2. Account-level webhooks: SVIX signatures (for calendar.* events)
 *
 * Supported events:
 * - bot.completed: Download all artifacts, generate AI content, store in DB
 * - bot.failed: Update meeting status with error
 * - bot.status_change: Update meeting status
 * - calendar.*: Handle calendar events
 */
export async function POST(request: NextRequest) {
    try {
        // Check authentication - support both methods
        const mbSecret = request.headers.get("x-mb-secret")
        const svixId = request.headers.get("svix-id")
        const svixTimestamp = request.headers.get("svix-timestamp")
        const svixSignature = request.headers.get("svix-signature")

        const isPerBotCallback = !!mbSecret
        const isSvixWebhook = !!(svixId && svixTimestamp && svixSignature)

        if (isPerBotCallback) {
            // Per-bot callback verification
            if (CALLBACK_SECRET && mbSecret !== CALLBACK_SECRET) {
                webhookLogger.warn("Webhook request with invalid x-mb-secret")
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }
        } else if (isSvixWebhook) {
            // SVIX webhook signature verification
            if (!SVIX_SECRET) {
                // FAIL SECURE: Do not process webhooks if secret is not configured
                webhookLogger.error("CRITICAL: SVIX webhook received but MEETINGBAAS_SVIX_SECRET not configured. Rejecting request.")
                return NextResponse.json({ error: "Configuration Error: Missing Webhook Secret" }, { status: 500 })
            } else {
                try {
                    const wh = new Webhook(SVIX_SECRET)
                    const body = await request.text()
                    // Verify signature - throws if invalid
                    wh.verify(body, {
                        "svix-id": svixId!,
                        "svix-timestamp": svixTimestamp!,
                        "svix-signature": svixSignature!,
                    })
                    webhookLogger.info("SVIX signature verified", { svix_id: svixId })
                    // Re-parse the body since we consumed it
                    const payload = JSON.parse(body)
                    return await processWebhook(payload, webhookLogger)
                } catch (err) {
                    webhookLogger.error("SVIX signature verification failed", err instanceof Error ? err : undefined)
                    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
                }
            }
        } else {
            // No authentication provided
            webhookLogger.warn("Webhook request with no authentication headers")
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const payload = await request.json()
        return await processWebhook(payload, webhookLogger)
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
 * Process webhook payload - extracted for reuse with SVIX verification
 */
async function processWebhook(payload: { event: string; data: unknown }, log: typeof webhookLogger) {
    const event = payload.event
    const data = payload.data as Record<string, unknown>

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/74db1504-71c7-4e46-b851-eb31403ad8ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'initial',
            hypothesisId: 'H1',
            location: 'app/api/webhooks/meetingbaas/route.ts:94',
            message: 'processWebhook entry',
            data: {
                event,
                bot_id: data?.bot_id,
            },
            timestamp: Date.now(),
        }),
    }).catch(() => {})
    // #endregion

    log.info(`Webhook received: ${event}`, {
        bot_id: data?.bot_id,
        status: (data?.status as { code?: string })?.code || data?.error_code
    })

    switch (event) {
        // Bot events
        case "bot.completed":
            await handleBotCompleted(data as unknown as BotCompletedData)
            break

        case "bot.failed":
            await handleBotFailed(data as unknown as Parameters<typeof handleBotFailed>[0])
            break

        case "bot.status_change":
            await handleStatusChange(data as unknown as Parameters<typeof handleStatusChange>[0])
            break

        // Calendar events
        case "calendar.connection_created":
            await handleCalendarConnectionCreated(data as unknown as Parameters<typeof handleCalendarConnectionCreated>[0])
            break

        case "calendar.connection_updated":
            await handleCalendarConnectionUpdated(data as unknown as Parameters<typeof handleCalendarConnectionUpdated>[0])
            break

        case "calendar.connection_deleted":
            await handleCalendarConnectionDeleted(data as unknown as Parameters<typeof handleCalendarConnectionDeleted>[0])
            break

        case "calendar.connection_error":
            await handleCalendarConnectionError(data as unknown as Parameters<typeof handleCalendarConnectionError>[0])
            break

        case "calendar.events_synced":
            await handleCalendarEventsSynced(data as unknown as Parameters<typeof handleCalendarEventsSynced>[0])
            break

        case "calendar.event_created":
            await handleCalendarEventCreated(data as unknown as Parameters<typeof handleCalendarEventCreated>[0])
            break

        case "calendar.event_updated":
            await handleCalendarEventUpdated(data as unknown as Parameters<typeof handleCalendarEventUpdated>[0])
            break

        case "calendar.event_cancelled":
            await handleCalendarEventCancelled(data as unknown as Parameters<typeof handleCalendarEventCancelled>[0])
            break

        default:
            log.warn(`Unhandled webhook event: ${event}`)
    }

    return NextResponse.json({ success: true })
}

// =============================================================================
// BOT EVENT HANDLERS
// =============================================================================

interface BotCompletedData {
    bot_id: string
    transcription?: string      // Processed transcript URL (utterances)
    raw_transcription?: string  // Raw Gladia response URL
    mp4?: string                // Video URL
    audio?: string              // Audio URL
    diarization?: string        // Diarization URL
    duration_seconds?: number
    participants?: string[]
    speakers?: string[]
    extra?: Record<string, unknown>
}

/**
 * Handle bot.completed event - MAIN PROCESSING FUNCTION
 *
 * This is where ALL content is downloaded and stored in Supabase.
 * After this function completes, all data is available locally and
 * MeetingBaas URLs can expire without impact.
 */
async function handleBotCompleted(data: BotCompletedData) {
    const { bot_id } = data
    webhookLogger.info("Processing bot.completed event", { bot_id })

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/74db1504-71c7-4e46-b851-eb31403ad8ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'initial',
            hypothesisId: 'H2',
            location: 'app/api/webhooks/meetingbaas/route.ts:181',
            message: 'handleBotCompleted start',
            data: {
                bot_id,
                has_extra: !!data.extra,
                has_user_id: !!(data.extra && (data.extra as Record<string, unknown>).user_id),
                has_calendar_id: !!(data.extra && (data.extra as Record<string, unknown>).calendar_id),
            },
            timestamp: Date.now(),
        }),
    }).catch(() => {})
    // #endregion

    try {
        // 1. Extract userId from extra (passed when bot was created)
        let userId = await extractUserId(data.extra)

        // 2. Find or create meeting record (we may need this even if userId is missing)
        let meeting = await prisma.meeting.findUnique({
            where: { botId: bot_id }
        })

        // 2a. Fallback: if we could not resolve userId from webhook extra,
        // but we have an existing meeting row, trust meeting.userId.
        if (!userId && meeting?.userId) {
            webhookLogger.info("Resolved user via existing meeting record", {
                bot_id,
                meeting_id: meeting.id,
            })
            userId = meeting.userId
        }

        if (!userId) {
            webhookLogger.error("Cannot process bot - no user_id in extra or existing meeting", undefined, { bot_id })
            return
        }

        if (!meeting) {
            webhookLogger.info("Creating meeting record from webhook", { bot_id })

            // Fetch additional bot details if needed
            let botDetails: { bot_name?: string; meeting_url?: string } = {}
            try {
                const details = await getBotStatus(bot_id)
                botDetails = {
                    bot_name: details.bot_name,
                    meeting_url: details.meeting_url,
                }
            } catch (err) {
                webhookLogger.warn("Could not fetch bot details", {
                    bot_id,
                    error: err instanceof Error ? err.message : String(err)
                })
            }

            meeting = await prisma.meeting.create({
                data: {
                    userId,
                    botId: bot_id,
                    botName: botDetails.bot_name || (data.extra?.bot_name as string) || "Potts Recorder",
                    meetingUrl: botDetails.meeting_url || (data.extra?.meeting_url as string) || "",
                    status: "completed",
                    processingStatus: "processing",
                    durationSeconds: data.duration_seconds,
                    extra: data.extra as object,
                }
            })
        } else {
            // Update existing meeting
            meeting = await prisma.meeting.update({
                where: { id: meeting.id },
                data: {
                    status: "completed",
                    processingStatus: "processing",
                    durationSeconds: data.duration_seconds,
                    extra: data.extra as object,
                }
            })
        }

        // 3. Download and store transcript (BEFORE URLs expire!)
        let utterances: unknown[] = []
        if (data.transcription) {
            webhookLogger.info("Downloading transcript", { bot_id, url: data.transcription })
            try {
                utterances = await getTranscript(data.transcription)

                // Also fetch raw transcription if available (includes Gladia summaries)
                let rawData: unknown = null
                if (data.raw_transcription) {
                    try {
                        const rawResponse = await fetch(data.raw_transcription, { cache: "no-store" })
                        if (rawResponse.ok) {
                            rawData = await rawResponse.json()
                        }
                    } catch (rawErr) {
                        webhookLogger.warn("Failed to fetch raw transcription", {
                            bot_id,
                            error: rawErr instanceof Error ? rawErr.message : String(rawErr)
                        })
                    }
                }

                // Store transcript in database
                await prisma.transcript.upsert({
                    where: { meetingId: meeting.id },
                    update: {
                        data: utterances as object,
                        rawData: rawData as object,
                    },
                    create: {
                        meetingId: meeting.id,
                        data: utterances as object,
                        rawData: rawData as object,
                    }
                })
                webhookLogger.info("Transcript saved", { bot_id, utterance_count: utterances.length })
            } catch (transcriptErr) {
                webhookLogger.error("Failed to fetch/save transcript", transcriptErr instanceof Error ? transcriptErr : undefined, {
                    bot_id
                })
            }
        }

        // 4. Download and store diarization (JSONL format - one JSON object per line)
        if (data.diarization) {
            webhookLogger.info("Downloading diarization", { bot_id })
            try {
                const diarizationResponse = await fetch(data.diarization, { cache: "no-store" })
                if (diarizationResponse.ok) {
                    const text = await diarizationResponse.text()
                    // Parse JSONL format (newline-delimited JSON)
                    const diarizationData = text
                        .split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            try {
                                return JSON.parse(line)
                            } catch {
                                return null
                            }
                        })
                        .filter(Boolean)

                    await prisma.diarization.upsert({
                        where: { meetingId: meeting.id },
                        update: { data: diarizationData },
                        create: { meetingId: meeting.id, data: diarizationData }
                    })
                    webhookLogger.info("Diarization saved", { bot_id, entries: diarizationData.length })
                }
            } catch (diarizationErr) {
                webhookLogger.warn("Failed to fetch/save diarization", {
                    bot_id,
                    error: diarizationErr instanceof Error ? diarizationErr.message : String(diarizationErr)
                })
            }
        }

        // 5. Store participants if provided
        if (data.participants && data.participants.length > 0) {
            await prisma.meeting.update({
                where: { id: meeting.id },
                data: { participantCount: data.participants.length }
            })

            // Create participant records
            await prisma.participant.deleteMany({ where: { meetingId: meeting.id } })
            await prisma.participant.createMany({
                data: data.participants.map(name => ({
                    meetingId: meeting.id,
                    name,
                }))
            })
        }

        // 6. Generate AI content (summaries, action items)
        if (utterances.length > 0) {
            webhookLogger.info("Generating AI content", { bot_id, utterance_count: utterances.length })
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { summary, actionItems } = await generateMeetingAIContent(utterances as any)

                // Store summary
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

                // Store action items
                await prisma.actionItem.deleteMany({ where: { meetingId: meeting.id } })
                if (actionItems.length > 0) {
                    await prisma.actionItem.createMany({
                        data: actionItems.map(item => ({
                            meetingId: meeting.id,
                            description: item.description,
                            assignee: item.assignee,
                            dueDate: item.dueDate,
                            completed: item.completed ?? false,
                        }))
                    })
                }

                webhookLogger.info("AI content saved", {
                    bot_id,
                    has_summary: !!summary.overview,
                    action_items: actionItems.length
                })
            } catch (aiErr) {
                webhookLogger.error("Failed to generate AI content", aiErr instanceof Error ? aiErr : undefined, {
                    bot_id
                })
                // Don't fail the whole process - transcript is still saved
            }
        }

        // 7. Store legacy URLs (kept for backwards compatibility, but not relied upon)
        // These URLs expire after 4 hours, but transcript/diarization is already saved above
        await prisma.meeting.update({
            where: { id: meeting.id },
            data: {
                processingStatus: "completed",
                videoUrl: data.mp4,
                audioUrl: data.audio,
                transcriptUrl: data.transcription,
                diarizationUrl: data.diarization,
                completedAt: new Date(),
            }
        })

        webhookLogger.info("Bot processing completed successfully", { bot_id, meeting_id: meeting.id })

    } catch (error) {
        webhookLogger.error("Error processing bot completion", error instanceof Error ? error : undefined, {
            bot_id,
            error: error instanceof Error ? error.message : String(error)
        })

        // Mark as failed
        try {
            await prisma.meeting.update({
                where: { botId: bot_id },
                data: { processingStatus: "failed" }
            })
        } catch {
            // Ignore - meeting might not exist
        }
    }
}

/**
 * Extract userId from webhook extra data
 * SECURITY: Only returns userId if we can definitively identify the user
 * Returns null if user cannot be determined (meeting will be rejected)
 */
async function extractUserId(extra?: Record<string, unknown>): Promise<string | null> {
    // Primary: Get from extra (new bots always pass this)
    if (extra?.user_id && typeof extra.user_id === 'string') {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/74db1504-71c7-4e46-b851-eb31403ad8ad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'initial',
                hypothesisId: 'H5',
                location: 'app/api/webhooks/meetingbaas/route.ts:429',
                message: 'extractUserId from extra.user_id',
                data: {
                    has_extra: !!extra,
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {})
        // #endregion
        return extra.user_id
    }

    // Secondary: Look up via calendar_id if provided (for calendar-scheduled bots)
    const calendarId = extra?.calendar_id as string | undefined
    if (calendarId) {
        const calendarAccount = await prisma.calendarAccount.findFirst({
            where: { meetingbaasCalendarId: calendarId },
            select: { userId: true }
        })
        if (calendarAccount) {
            webhookLogger.info("Resolved user via calendar_id", { calendar_id: calendarId })

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/74db1504-71c7-4e46-b851-eb31403ad8ad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: 'debug-session',
                    runId: 'initial',
                    hypothesisId: 'H6',
                    location: 'app/api/webhooks/meetingbaas/route.ts:441',
                    message: 'extractUserId via calendar_id lookup',
                    data: {
                        calendar_id: calendarId,
                        resolved_user: true,
                    },
                    timestamp: Date.now(),
                }),
            }).catch(() => {})
            // #endregion

            return calendarAccount.userId
        }
    }

    // SECURITY: Do NOT fall back to random users - this would be a privacy violation
    // If we can't identify the user, reject the webhook
    webhookLogger.error("Cannot identify user for webhook - no user_id or valid calendar_id", undefined, {
        has_extra: !!extra,
        has_calendar_id: !!calendarId
    })

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/74db1504-71c7-4e46-b851-eb31403ad8ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'initial',
            hypothesisId: 'H7',
            location: 'app/api/webhooks/meetingbaas/route.ts:448',
            message: 'extractUserId failed to resolve user',
            data: {
                has_extra: !!extra,
                has_calendar_id: !!calendarId,
            },
            timestamp: Date.now(),
        }),
    }).catch(() => {})
    // #endregion

    return null
}

/**
 * Handle bot.failed event
 */
async function handleBotFailed(data: {
    bot_id: string
    error_code?: string
    error_message?: string
    extra?: Record<string, unknown>
}) {
    const { bot_id } = data
    webhookLogger.error("Bot failed", undefined, {
        bot_id,
        error_code: data.error_code,
        error_message: data.error_message,
    })

    try {
        // First try to update existing meeting
        const updated = await prisma.meeting.updateMany({
            where: { botId: bot_id },
            data: {
                status: "failed",
                processingStatus: "failed",
                errorCode: data.error_code,
                errorMessage: data.error_message,
            }
        })

        if (updated.count === 0) {
            // Meeting doesn't exist - create it
            const userId = await extractUserId(data.extra)
            if (userId) {
                await prisma.meeting.create({
                    data: {
                        userId,
                        botId: bot_id,
                        botName: (data.extra?.bot_name as string) || "Potts Recorder",
                        meetingUrl: (data.extra?.meeting_url as string) || "",
                        status: "failed",
                        processingStatus: "failed",
                        errorCode: data.error_code,
                        errorMessage: data.error_message,
                        extra: data.extra as object,
                    }
                })
            }
        }

        webhookLogger.info("Meeting marked as failed", { bot_id })
    } catch (error) {
        webhookLogger.error("Failed to update meeting status", error instanceof Error ? error : undefined, {
            bot_id
        })
    }
}

/**
 * Handle bot.status_change event
 */
async function handleStatusChange(data: {
    bot_id: string
    status?: { code: string; created_at: string }
    extra?: Record<string, unknown>
}) {
    const { bot_id } = data
    const statusCode = data.status?.code

    webhookLogger.debug("Bot status changed", {
        bot_id,
        status_code: statusCode,
        timestamp: data.status?.created_at
    })

    if (!statusCode) return

    try {
        await prisma.meeting.updateMany({
            where: { botId: bot_id },
            data: { status: statusCode }
        })
    } catch (error) {
        webhookLogger.warn("Failed to update meeting status", {
            bot_id,
            error: error instanceof Error ? error.message : String(error)
        })
    }
}

// =============================================================================
// CALENDAR EVENT HANDLERS
// =============================================================================

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
        await prisma.calendarAccount.updateMany({
            where: { meetingbaasCalendarId: data.calendar_id },
            data: { isActive: true, updatedAt: new Date() }
        })
    } catch (error) {
        webhookLogger.error("Failed to update calendar connection", error instanceof Error ? error : undefined, {
            calendar_id: data.calendar_id
        })
    }
}

async function handleCalendarConnectionUpdated(data: {
    calendar_id: string
    platform: string
    status?: string
}) {
    webhookLogger.info("Calendar connection updated", data)

    try {
        await prisma.calendarAccount.updateMany({
            where: { meetingbaasCalendarId: data.calendar_id },
            data: { isActive: data.status === "active", updatedAt: new Date() }
        })
    } catch (error) {
        webhookLogger.error("Failed to update calendar connection", error instanceof Error ? error : undefined)
    }
}

async function handleCalendarConnectionDeleted(data: {
    calendar_id: string
    platform: string
}) {
    webhookLogger.info("Calendar connection deleted", data)

    try {
        await prisma.calendarAccount.updateMany({
            where: { meetingbaasCalendarId: data.calendar_id },
            data: { isActive: false, updatedAt: new Date() }
        })
    } catch (error) {
        webhookLogger.error("Failed to mark calendar as deleted", error instanceof Error ? error : undefined)
    }
}

async function handleCalendarConnectionError(data: {
    calendar_id: string
    platform: string
    error?: string
    status?: string
}) {
    webhookLogger.error("Calendar connection error", undefined, data)

    try {
        await prisma.calendarAccount.updateMany({
            where: { meetingbaasCalendarId: data.calendar_id },
            data: { isActive: false, updatedAt: new Date() }
        })
    } catch (error) {
        webhookLogger.error("Failed to update calendar error status", error instanceof Error ? error : undefined)
    }
}

async function handleCalendarEventsSynced(data: {
    calendar_id: string
    events_synced?: number
    sync_type?: string
}) {
    webhookLogger.info("Calendar events synced", data)
    // Informational only - individual events handled by event_created/updated/cancelled
}

/**
 * Handle calendar.event_created - AUTO-SCHEDULE bots for new events
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
        instance_count: data.instances?.length
    })

    if (!data.instances || data.instances.length === 0) return

    // Get userId from calendar account
    const calendarAccount = await prisma.calendarAccount.findFirst({
        where: { meetingbaasCalendarId: data.calendar_id },
        select: { userId: true }
    })

    const userId = calendarAccount?.userId

    for (const instance of data.instances) {
        // Skip events without meeting URLs
        if (!instance.meeting_url) continue

        // Skip already scheduled events
        if (instance.bot_scheduled) continue

        // Skip past events
        const eventStart = new Date(instance.start_time)
        if (eventStart <= new Date()) continue

        // Schedule the bot with user_id
        try {
            await scheduleCalendarBot(data.calendar_id, instance.event_id, {
                botName: `Potts - ${instance.title}`,
                seriesId: data.series_id,
                userId: userId || undefined,  // Pass userId for webhook association
            })
            webhookLogger.info("Auto-scheduled bot for event", {
                event_id: instance.event_id,
                title: instance.title,
                start_time: instance.start_time
            })
        } catch (error) {
            webhookLogger.error("Failed to auto-schedule bot", error instanceof Error ? error : undefined, {
                event_id: instance.event_id,
                title: instance.title
            })
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
    }
}

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
        bot_id?: string
    }>
}) {
    webhookLogger.info("Calendar event updated", {
        calendar_id: data.calendar_id,
        instance_count: data.affected_instances?.length
    })

    if (!data.affected_instances || data.affected_instances.length === 0) return

    // Get userId from calendar account
    const calendarAccount = await prisma.calendarAccount.findFirst({
        where: { meetingbaasCalendarId: data.calendar_id },
        select: { userId: true }
    })
    const userId = calendarAccount?.userId

    for (const instance of data.affected_instances) {
        // If event now has a meeting URL and no bot scheduled, schedule one
        if (instance.meeting_url && !instance.bot_scheduled) {
            const eventStart = new Date(instance.start_time)
            if (eventStart <= new Date()) continue // Skip past events

            try {
                await scheduleCalendarBot(data.calendar_id, instance.event_id, {
                    botName: `Potts - ${instance.title}`,
                    seriesId: data.series_id,
                    userId: userId || undefined,
                })
                webhookLogger.info("Scheduled bot for updated event", {
                    event_id: instance.event_id,
                    title: instance.title
                })
            } catch (error) {
                webhookLogger.error("Failed to schedule bot for updated event", error instanceof Error ? error : undefined, {
                    event_id: instance.event_id
                })
            }

            await new Promise(resolve => setTimeout(resolve, 500))
        }

        // Update cached event in database if we track it
        try {
            await prisma.calendarEvent.updateMany({
                where: { eventId: instance.event_id },
                data: {
                    title: instance.title,
                    startTime: new Date(instance.start_time),
                    endTime: new Date(instance.end_time),
                    meetingUrl: instance.meeting_url,
                    botScheduled: instance.bot_scheduled || false,
                    lastFetchedAt: new Date(),
                }
            })
        } catch {
            // Event might not be cached yet, ignore
        }
    }
}

async function handleCalendarEventCancelled(data: {
    calendar_id: string
    event_type: "one_off" | "recurring"
    series_id?: string
    cancelled_instances?: Array<{
        event_id: string
        title: string
        start_time: string
        bot_id?: string
    }>
}) {
    webhookLogger.info("Calendar event cancelled", {
        calendar_id: data.calendar_id,
        instance_count: data.cancelled_instances?.length
    })

    if (!data.cancelled_instances || data.cancelled_instances.length === 0) return

    for (const instance of data.cancelled_instances) {
        // If a bot was scheduled for this event, try to cancel it
        if (instance.bot_id) {
            try {
                await cancelScheduledBot(instance.bot_id)
                webhookLogger.info("Cancelled bot for cancelled event", {
                    event_id: instance.event_id,
                    bot_id: instance.bot_id,
                    title: instance.title
                })
            } catch (error) {
                // Bot may have already started or completed - that's OK
                webhookLogger.warn("Could not cancel bot (may have already started)", {
                    event_id: instance.event_id,
                    bot_id: instance.bot_id,
                    error: error instanceof Error ? error.message : String(error)
                })
            }

            await new Promise(resolve => setTimeout(resolve, 500))
        }

        // Remove from cached events in database
        try {
            await prisma.calendarEvent.deleteMany({
                where: { eventId: instance.event_id }
            })
        } catch {
            // Event might not be cached, ignore
        }
    }
}
