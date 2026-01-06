import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createCalendarConnection, listCalendars } from "@/lib/api/meetingbaas"
import { getGoogleCredentials } from "@/lib/api/google-oauth"
import { autoScheduleBotsForEvents } from "@/lib/api/auto-schedule"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child('auth:callback')

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const next = searchParams.get("next") ?? "/"

    if (code) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                            // The `setAll` method was called from a Server Component.
                        }
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.session) {
            let calendarConnected = false

            // Try to auto-connect calendar if we have provider tokens
            try {
                const providerToken = data.session.provider_token
                const providerRefreshToken = data.session.provider_refresh_token
                log.debug("Provider tokens available", { has_token: !!providerToken, has_refresh: !!providerRefreshToken })

                if (providerRefreshToken) {
                    const { clientId, clientSecret } = getGoogleCredentials()

                    // Only attempt connection if we have Google OAuth credentials configured
                    if (clientId && clientSecret) {
                        let calendar

                        // Try to create calendar connection, handle "already exists" gracefully
                        try {
                            log.info("Creating calendar connection")
                            calendar = await createCalendarConnection({
                                oauthClientId: clientId,
                                oauthClientSecret: clientSecret,
                                oauthRefreshToken: providerRefreshToken,
                                platform: "google",
                            })
                            log.info("Calendar connected successfully", { calendar_id: calendar.calendar_id })
                        } catch (createErr) {
                            const errorMessage = createErr instanceof Error ? createErr.message : String(createErr)

                            // Handle "already exists" - fetch existing calendars
                            if (errorMessage.includes("already exists")) {
                                log.info("Calendar already exists in MeetingBaas, fetching existing")
                                const existingCalendars = await listCalendars()
                                if (existingCalendars.length > 0) {
                                    // Use the most recent calendar
                                    calendar = existingCalendars[existingCalendars.length - 1]
                                    log.info("Using existing calendar", { calendar_id: calendar?.calendar_id })
                                }
                            } else {
                                throw createErr
                            }
                        }

                        if (calendar?.calendar_id) {
                            calendarConnected = true

                            // Store in Supabase for reference
                            const { data: { user } } = await supabase.auth.getUser()
                            const calendarEmail = calendar.account_email || user?.email || ""

                            log.info("Saving calendar to database", {
                                calendar_id: calendar.calendar_id,
                                email: calendarEmail,
                                user_id: user?.id
                            })

                            if (user && providerToken) {
                                // Use Prisma instead of Supabase client to bypass RLS
                                const expiresAt = new Date(Date.now() + 3600 * 1000)
                                const encryptedAccessToken = encrypt(providerToken)
                                const encryptedRefreshToken = encrypt(providerRefreshToken)

                                try {
                                    await prisma.calendarAccount.upsert({
                                        where: {
                                            userId_provider_email: {
                                                userId: user.id,
                                                provider: "google",
                                                email: calendarEmail,
                                            }
                                        },
                                        update: {
                                            accessToken: encryptedAccessToken,
                                            refreshToken: encryptedRefreshToken,
                                            expiresAt: expiresAt,
                                            scope: "calendar.readonly calendar.events.readonly",
                                            isActive: true,
                                            meetingbaasCalendarId: calendar.calendar_id,
                                        },
                                        create: {
                                            userId: user.id,
                                            provider: "google",
                                            email: calendarEmail,
                                            accessToken: encryptedAccessToken,
                                            refreshToken: encryptedRefreshToken,
                                            expiresAt: expiresAt,
                                            scope: "calendar.readonly calendar.events.readonly",
                                            isActive: true,
                                            meetingbaasCalendarId: calendar.calendar_id,
                                        }
                                    })
                                    log.info("Calendar saved to database successfully")
                                } catch (dbError) {
                                    log.error("Database error saving calendar", dbError instanceof Error ? dbError : undefined)
                                }
                            }

                            // AUTO-SCHEDULE: Schedule bots for all upcoming meetings
                            log.info("Auto-scheduling bots for upcoming meetings")
                            const autoScheduleResult = await autoScheduleBotsForEvents(calendar.calendar_id)
                            log.info("Auto-schedule complete", {
                                scheduled: autoScheduleResult.scheduled,
                                failed: autoScheduleResult.failed,
                                skipped: autoScheduleResult.skipped
                            })
                        }
                    }
                }
            } catch (err) {
                // Calendar connection failed, but login succeeded - don't block the user
                log.error("Auto calendar connect failed", err instanceof Error ? err : undefined)
            }

            // Ensure next is a valid relative path
            const redirectPath = next.startsWith("/") ? next : "/"
            const calendarParam = calendarConnected ? "?calendar_connected=true" : ""
            return NextResponse.redirect(`${origin}${redirectPath}${calendarParam}`)
        }
    }

    // Return the user to login page with error
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
