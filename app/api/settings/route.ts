import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/settings
 * Get current user's settings
 */
export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Get or create settings
        const settings = await prisma.userSettings.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id,
                customVocabulary: [],
            },
        })

        return NextResponse.json({
            customVocabulary: settings.customVocabulary,
        })
    } catch (error) {
        console.error("Failed to get settings:", error)
        return NextResponse.json(
            { error: "Failed to get settings" },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/settings
 * Update user's settings
 */
export async function PATCH(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()

        // Validate customVocabulary if provided
        if (body.customVocabulary !== undefined) {
            if (!Array.isArray(body.customVocabulary)) {
                return NextResponse.json(
                    { error: "customVocabulary must be an array" },
                    { status: 400 }
                )
            }
            // Ensure all items are strings and remove duplicates
            const filtered = body.customVocabulary
                .filter((item: unknown): item is string => typeof item === "string" && item.trim() !== "")
                .map((item: string) => item.trim())
            const vocabulary: string[] = Array.from(new Set(filtered))

            const settings = await prisma.userSettings.upsert({
                where: { userId: user.id },
                update: { customVocabulary: vocabulary },
                create: {
                    userId: user.id,
                    customVocabulary: vocabulary,
                },
            })

            return NextResponse.json({
                customVocabulary: settings.customVocabulary,
            })
        }

        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    } catch (error) {
        console.error("Failed to update settings:", error)
        return NextResponse.json(
            { error: "Failed to update settings" },
            { status: 500 }
        )
    }
}
