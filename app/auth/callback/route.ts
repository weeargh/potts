import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createCalendarConnection } from "@/lib/api/meetingbaas"
import { getGoogleCredentials } from "@/lib/api/google-oauth"
import { autoScheduleBotsForEvents } from "@/lib/api/auto-schedule"
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
                        // Support multiple calendars - no cleanup needed
                        // Create the calendar connection
                        log.info("Creating calendar connection")
                        const calendar = await createCalendarConnection({
                            oauthClientId: clientId,
                            oauthClientSecret: clientSecret,
                            oauthRefreshToken: providerRefreshToken,
                            platform: "google",
                        })
                        log.info("Calendar connected successfully", { calendar_id: calendar.calendar_id })
                        calendarConnected = true

                        // Store in Supabase for reference
                        const { data: { user } } = await supabase.auth.getUser()
                        if (user && providerToken) {
                            await supabase.from("calendar_accounts").upsert({
                                user_id: user.id,
                                provider: "google",
                                email: user.email || "",
                                access_token: providerToken,
                                refresh_token: providerRefreshToken,
                                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                                scope: "calendar.readonly calendar.events.readonly",
                                is_active: true,
                                meetingbaas_calendar_id: calendar.calendar_id,
                            }, {
                                onConflict: "user_id,provider,email",
                            })
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
