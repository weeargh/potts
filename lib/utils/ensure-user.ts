import { prisma } from "@/lib/prisma"
import { User } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const userLogger = logger.child('ensure-user')

/**
 * Ensures a user record exists in the public.users table.
 * This syncs the Supabase Auth user to our Prisma database for foreign key relationships.
 * 
 * Call this from any authenticated API route or server action to guarantee
 * the user exists before creating related records (meetings, etc.)
 */
export async function ensureUserExists(authUser: User): Promise<{ id: string; email: string }> {
    try {
        const user = await prisma.user.upsert({
            where: { id: authUser.id },
            update: {
                email: authUser.email || "",
                ...(authUser.user_metadata?.name && { name: authUser.user_metadata.name }),
                ...(authUser.user_metadata?.avatar_url && { avatarUrl: authUser.user_metadata.avatar_url }),
                ...(authUser.user_metadata?.full_name && { name: authUser.user_metadata.full_name }),
            },
            create: {
                id: authUser.id,
                email: authUser.email || "",
                ...(authUser.user_metadata?.name && { name: authUser.user_metadata.name }),
                ...(authUser.user_metadata?.avatar_url && { avatarUrl: authUser.user_metadata.avatar_url }),
                ...(authUser.user_metadata?.full_name && { name: authUser.user_metadata.full_name }),
            },
            select: {
                id: true,
                email: true,
            }
        })

        userLogger.debug("User sync successful", { user_id: user.id, email: user.email })
        return user
    } catch (error) {
        userLogger.error("Failed to sync user to database", error instanceof Error ? error : undefined, {
            auth_user_id: authUser.id,
            auth_email: authUser.email
        })

        // Return the auth user info even if DB sync fails
        // This allows the request to proceed (graceful degradation)
        return {
            id: authUser.id,
            email: authUser.email || ""
        }
    }
}

/**
 * Helper to get authenticated user and ensure they exist in the database.
 * Use this in API routes instead of just calling supabase.auth.getUser()
 */
export async function getAuthenticatedUser(supabase: { auth: { getUser: () => Promise<{ data: { user: User | null }, error: Error | null }> } }) {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return { user: null, error: error || new Error("Not authenticated") }
    }

    // Ensure user exists in database
    const dbUser = await ensureUserExists(user)

    return {
        user: {
            ...user,
            dbId: dbUser.id, // Confirmed database ID
        },
        error: null
    }
}
