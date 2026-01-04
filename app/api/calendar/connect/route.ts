import { NextRequest, NextResponse } from "next/server"
import { getGoogleAuthUrl } from "@/lib/api/google-oauth"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
    const { origin } = new URL(request.url)

    // Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        // Redirect to login instead of returning JSON
        return NextResponse.redirect(`${origin}/login?redirect=/api/calendar/connect`)
    }

    const redirectUri = `${origin}/api/calendar/callback`

    // Generate state for CSRF protection
    const state = crypto.randomUUID()

    const authUrl = getGoogleAuthUrl(redirectUri, state)

    return NextResponse.redirect(authUrl)
}
