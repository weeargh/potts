import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createCalendarConnection } from "@/lib/api/meetingbaas"
import { getGoogleCredentials } from "@/lib/api/google-oauth"

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
            // Try to auto-connect calendar if we have provider tokens
            try {
                const providerToken = data.session.provider_token
                const providerRefreshToken = data.session.provider_refresh_token

                if (providerRefreshToken) {
                    const { clientId, clientSecret } = getGoogleCredentials()

                    // Only attempt connection if we have Google OAuth credentials configured
                    if (clientId && clientSecret) {
                        await createCalendarConnection({
                            oauthClientId: clientId,
                            oauthClientSecret: clientSecret,
                            oauthRefreshToken: providerRefreshToken,
                            platform: "google",
                        })

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
                            }, {
                                onConflict: "user_id,provider,email",
                            })
                        }
                    }
                }
            } catch (err) {
                // Calendar connection failed, but login succeeded - don't block the user
                console.error("Auto calendar connect failed:", err)
            }

            // Ensure next is a valid relative path
            const redirectPath = next.startsWith("/") ? next : "/"
            return NextResponse.redirect(`${origin}${redirectPath}`)
        }
    }

    // Return the user to login page with error
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}

