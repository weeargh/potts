import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForTokens, getGoogleCredentials } from "@/lib/api/google-oauth"
import { createCalendarConnection, listCalendars, deleteCalendar } from "@/lib/api/meetingbaas"
import { createClient } from "@/lib/supabase/server"
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
            log.error("Calendar creation failed", createErr instanceof Error ? createErr : undefined, { error: errorMessage })
            throw createErr
        }

        // Get current user from Supabase
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        log.debug("Supabase user", { user_id: user?.id })

        // Ensure user exists in database before storing calendar
        if (user) {
            await ensureUserExists(user)
        }

        if (user && calendar.account_email) {
            // Store calendar connection in Supabase with encrypted tokens
            const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

            // Encrypt sensitive tokens before storing
            const encryptedAccessToken = encrypt(tokens.access_token)
            const encryptedRefreshToken = encrypt(tokens.refresh_token)

            const { error: dbError } = await supabase.from("calendar_accounts").upsert({
                user_id: user.id,
                provider: "google",
                email: calendar.account_email,
                access_token: encryptedAccessToken,
                refresh_token: encryptedRefreshToken,
                expires_at: expiresAt.toISOString(),
                scope: tokens.scope,
                is_active: true,
                meetingbaas_calendar_id: calendar.calendar_id,
            }, {
                onConflict: "user_id,provider,email",
            })

            if (dbError) {
                log.error("Supabase DB error", undefined, { error: dbError.message })
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

        return NextResponse.redirect(`${origin}/?calendar_connected=true`)
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
