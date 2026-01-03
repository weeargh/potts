import { NextRequest, NextResponse } from "next/server"
import { listRawCalendars, createCalendarConnection } from "@/lib/api/meetingbaas"
import { getGoogleCredentials } from "@/lib/api/google-oauth"

// Debug endpoint to test MeetingBaas API directly
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { refresh_token, action } = body

        if (!refresh_token) {
            return NextResponse.json({ error: "refresh_token required" }, { status: 400 })
        }

        const { clientId, clientSecret } = getGoogleCredentials()

        if (!clientId || !clientSecret) {
            return NextResponse.json({
                error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET",
                hasClientId: !!clientId,
                hasClientSecret: !!clientSecret,
            }, { status: 500 })
        }

        if (action === "list-raw") {
            // Test listing raw calendars
            const rawCalendars = await listRawCalendars({
                oauthClientId: clientId,
                oauthClientSecret: clientSecret,
                oauthRefreshToken: refresh_token,
                platform: "google",
            })
            return NextResponse.json({ success: true, calendars: rawCalendars })
        }

        if (action === "connect") {
            // Test creating calendar connection
            const calendar = await createCalendarConnection({
                oauthClientId: clientId,
                oauthClientSecret: clientSecret,
                oauthRefreshToken: refresh_token,
                platform: "google",
            })
            return NextResponse.json({ success: true, calendar })
        }

        return NextResponse.json({ error: "action must be 'list-raw' or 'connect'" }, { status: 400 })
    } catch (error) {
        console.error("Debug calendar error:", error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }, { status: 500 })
    }
}
