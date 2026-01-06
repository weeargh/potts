import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForTokens, getGoogleCredentials } from "@/lib/api/google-oauth"
import { createCalendarConnection, listCalendars } from "@/lib/api/meetingbaas"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { ensureUserExists } from "@/lib/utils/ensure-user"
import { logger } from "@/lib/logger"

const log = logger.child('api:calendar:callback')

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const error = searchParams.get("error")
    const debug = searchParams.get("debug") // Add debug mode

    if (error) {
        log.error("Calendar OAuth error from Google", undefined, { error })
        return NextResponse.redirect(`${origin}/?error=calendar_auth_denied`)
    }

    if (!code) {
        log.error("Missing auth code in callback")
        return NextResponse.redirect(`${origin}/?error=missing_auth_code`)
    }

    try {
        const redirectUri = `${origin}/api/calendar/callback`
        log.info("Exchanging code for tokens")

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code, redirectUri)
        log.info("Token exchange successful", { has_refresh_token: !!tokens.refresh_token })

        if (!tokens.refresh_token) {
            log.error("No refresh token received from Google")
            return NextResponse.redirect(`${origin}/?error=no_refresh_token`)
        }

        // Get Google credentials for MeetingBaas
        const { clientId, clientSecret } = getGoogleCredentials()
        log.debug("Google credentials loaded", { hasClientId: !!clientId, hasClientSecret: !!clientSecret })

        if (!clientId || !clientSecret) {
            log.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET")
            return NextResponse.redirect(`${origin}/?error=missing_google_credentials`)
        }

        // Support multiple calendars - no longer delete existing calendars
        // Each user can connect multiple Google accounts (personal + work)

        // Create calendar connection in MeetingBaas
        log.info("Creating calendar connection in MeetingBaas")
        let calendar
        try {
            calendar = await createCalendarConnection({
                oauthClientId: clientId,
                oauthClientSecret: clientSecret,
                oauthRefreshToken: tokens.refresh_token,
                platform: "google",
            })
            log.info("MeetingBaas calendar created successfully", { calendar_id: calendar.calendar_id })
        } catch (createErr) {
            const errorMessage = createErr instanceof Error ? createErr.message : String(createErr)

            // Handle "already exists" error gracefully - fetch existing calendar
            if (errorMessage.includes("already exists")) {
                log.info("Calendar already exists in MeetingBaas, fetching existing calendars")
                try {
                    const existingCalendars = await listCalendars()
                    // Find the calendar that matches this refresh token's account
                    // We'll use the most recently created one as a fallback
                    if (existingCalendars.length > 0) {
                        calendar = existingCalendars[existingCalendars.length - 1]
                        log.info("Using existing calendar", { calendar_id: calendar?.calendar_id })
                    }
                } catch (listErr) {
                    log.error("Failed to list existing calendars", listErr instanceof Error ? listErr : undefined)
                }
            }

            // If we still don't have a calendar, throw the original error
            if (!calendar) {
                log.error("Calendar creation failed", createErr instanceof Error ? createErr : undefined, { error: errorMessage })
                throw createErr
            }
        }

        // Get current user from Supabase
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        log.debug("Supabase user", { user_id: user?.id })

        // Ensure user exists in database before storing calendar
        if (user) {
            await ensureUserExists(user)
        }

        // Determine email to use: prefer calendar's account_email, fallback to user email
        const calendarEmail = calendar?.account_email || user?.email || ""
        log.debug("Calendar save details", {
            has_user: !!user,
            has_calendar: !!calendar,
            calendar_id: calendar?.calendar_id,
            account_email: calendar?.account_email,
            user_email: user?.email,
            calendarEmail
        })

        if (user && calendar?.calendar_id) {
            // Store calendar connection in Supabase with encrypted tokens
            const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

            // Encrypt sensitive tokens before storing
            const encryptedAccessToken = encrypt(tokens.access_token)
            const encryptedRefreshToken = encrypt(tokens.refresh_token)

            log.info("Saving calendar to database", { calendar_id: calendar.calendar_id, email: calendarEmail })

            // Use Prisma instead of Supabase client to bypass RLS
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
                        scope: tokens.scope,
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
                        scope: tokens.scope,
                        isActive: true,
                        meetingbaasCalendarId: calendar.calendar_id,
                    }
                })
                log.info("Calendar saved to database successfully")
            } catch (dbError) {
                log.error("Database error saving calendar", dbError instanceof Error ? dbError : undefined)
            }
        }

        // If debug mode, return JSON instead of redirect
        if (debug) {
            return NextResponse.json({
                success: true,
                calendar,
                user_id: user?.id,
                tokens_received: {
                    has_access_token: !!tokens.access_token,
                    has_refresh_token: !!tokens.refresh_token,
                    expires_in: tokens.expires_in,
                }
            })
        }

        return NextResponse.redirect(`${origin}/settings?calendar_connected=true`)
    } catch (err) {
        log.error("Calendar OAuth callback error", err instanceof Error ? err : undefined)

        // Return more details in debug mode
        if (debug) {
            return NextResponse.json({
                success: false,
                error: err instanceof Error ? err.message : "Unknown error",
                stack: err instanceof Error ? err.stack : undefined,
            }, { status: 500 })
        }

        // Include error message in URL for debugging
        const errorMsg = err instanceof Error ? encodeURIComponent(err.message) : "unknown"
        return NextResponse.redirect(`${origin}/?error=calendar_connection_failed&details=${errorMsg}`)
    }
}
