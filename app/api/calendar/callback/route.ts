import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForTokens, getGoogleCredentials } from "@/lib/api/google-oauth"
import { createCalendarConnection } from "@/lib/api/meetingbaas"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
        return NextResponse.redirect(`${origin}/?error=calendar_auth_denied`)
    }

    if (!code) {
        return NextResponse.redirect(`${origin}/?error=missing_auth_code`)
    }

    try {
        const redirectUri = `${origin}/api/calendar/callback`

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code, redirectUri)

        // Get Google credentials for MeetingBaas
        const { clientId, clientSecret } = getGoogleCredentials()

        // Create calendar connection in MeetingBaas
        const calendar = await createCalendarConnection({
            oauthClientId: clientId,
            oauthClientSecret: clientSecret,
            oauthRefreshToken: tokens.refresh_token,
            platform: "google",
        })

        // Get current user from Supabase
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            // Store calendar connection in Supabase
            const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

            await supabase.from("calendar_accounts").upsert({
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
        }

        return NextResponse.redirect(`${origin}/?calendar_connected=true`)
    } catch (err) {
        console.error("Calendar OAuth callback error:", err)
        return NextResponse.redirect(`${origin}/?error=calendar_connection_failed`)
    }
}
