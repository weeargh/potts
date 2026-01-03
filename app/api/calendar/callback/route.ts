import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForTokens, getGoogleCredentials } from "@/lib/api/google-oauth"
import { createCalendarConnection } from "@/lib/api/meetingbaas"
import { createClient } from "@/lib/supabase/server"

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

        // Create calendar connection in MeetingBaas
        console.log("Creating calendar connection in MeetingBaas...")
        const calendar = await createCalendarConnection({
            oauthClientId: clientId,
            oauthClientSecret: clientSecret,
            oauthRefreshToken: tokens.refresh_token,
            platform: "google",
        })
        console.log("MeetingBaas calendar created:", calendar)

        // Get current user from Supabase
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        console.log("Supabase user:", user?.id)

        if (user && calendar.email) {
            // Store calendar connection in Supabase
            const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

            const { error: dbError } = await supabase.from("calendar_accounts").upsert({
                user_id: user.id,
                provider: "google",
                email: calendar.email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: expiresAt.toISOString(),
                scope: tokens.scope,
                is_active: true,
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

        return NextResponse.redirect(`${origin}/?error=calendar_connection_failed`)
    }
}
