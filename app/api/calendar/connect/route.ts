import { NextRequest, NextResponse } from "next/server"
import { getGoogleAuthUrl } from "@/lib/api/google-oauth"

export async function GET(request: NextRequest) {
    const { origin } = new URL(request.url)
    const redirectUri = `${origin}/api/calendar/callback`

    // Generate state for CSRF protection
    const state = crypto.randomUUID()

    const authUrl = getGoogleAuthUrl(redirectUri, state)

    return NextResponse.redirect(authUrl)
}
