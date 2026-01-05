import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForTokens, getGoogleCredentials } from "@/lib/api/google-oauth"
import { createCalendarConnection, listCalendars, deleteCalendar } from "@/lib/api/meetingbaas"
import { createClient } from "@/lib/supabase/server"
import { encrypt } from "@/lib/crypto"
import { ensureUserExists } from "@/lib/utils/ensure-user"

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const error = searchParams.get("error")
    const debug = searchParams.get("debug") // Add debug mode

    if (error) {
        console.error("Calendar OAuth error from Google:", error)
        return NextResponse.redirect(`${origin}/?error=calendar_auth_denied`)
    }

    if (!code) {
        console.error("Missing auth code in callback")
        return NextResponse.redirect(`${origin}/?error=missing_auth_code`)
    }

    try {
        const redirectUri = `${origin}/api/calendar/callback`
        console.log("Calendar callback - exchanging code for tokens...")

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code, redirectUri)
        console.log("Token exchange successful, got refresh_token:", !!tokens.refresh_token)

        if (!tokens.refresh_token) {
            console.error("No refresh token received from Google")
            return NextResponse.redirect(`${origin}/?error=no_refresh_token`)
        }

        // Get Google credentials for MeetingBaas
        const { clientId, clientSecret } = getGoogleCredentials()
        console.log("Google credentials loaded:", { hasClientId: !!clientId, hasClientSecret: !!clientSecret })

        if (!clientId || !clientSecret) {
            console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET")
            return NextResponse.redirect(`${origin}/?error=missing_google_credentials`)
        }

        // PROACTIVE CLEANUP: Delete any existing Google calendars before creating new one
        // This fixes duplicate calendar issues and ensures a clean state
        console.log("Checking for existing calendar connections to cleanup...")
        try {
            const existingCalendars = await listCalendars()
            console.log("Found existing calendars:", existingCalendars.length)

            // Delete ALL existing Google calendars proactively
            for (const cal of existingCalendars) {
                if (cal.calendar_platform === 'google') {
                    console.log(`Proactively deleting existing calendar: ${cal.calendar_id} (${cal.account_email})`)
                    try {
                        await deleteCalendar(cal.calendar_id)
                        // Rate limit pause between deletions
                        await new Promise(resolve => setTimeout(resolve, 1500))
                    } catch (delErr) {
                        console.warn(`Failed to delete calendar ${cal.calendar_id}:`, delErr)
                        // Continue with other deletions
                    }
                }
            }

            if (existingCalendars.filter(c => c.calendar_platform === 'google').length > 0) {
                // Extra pause after cleanup before creating new connection
                console.log("Waiting after cleanup before creating new connection...")
                await new Promise(resolve => setTimeout(resolve, 2000))
            }
        } catch (listErr) {
            console.log("No existing calendars or error listing (this is OK):", listErr)
        }

        // Create calendar connection in MeetingBaas
        console.log("Creating calendar connection in MeetingBaas...")
        let calendar
        try {
            calendar = await createCalendarConnection({
                oauthClientId: clientId,
                oauthClientSecret: clientSecret,
                oauthRefreshToken: tokens.refresh_token,
                platform: "google",
            })
            console.log("MeetingBaas calendar created successfully:", calendar)
        } catch (createErr) {
            const errorMessage = createErr instanceof Error ? createErr.message : String(createErr)
            console.error("Calendar creation failed:", errorMessage)
            throw createErr
        }

        // Get current user from Supabase
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        console.log("Supabase user:", user?.id)

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
                console.error("Supabase DB error:", dbError)
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
        console.error("Calendar OAuth callback error:", err)

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
