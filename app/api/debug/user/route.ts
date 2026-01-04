import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
    try {
        // Check Supabase Auth user
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        // Check Prisma user
        let prismaUser = null
        if (user?.id) {
            prismaUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: { id: true, email: true, createdAt: true }
            })
        }

        return NextResponse.json({
            supabase_auth: {
                authenticated: !!user,
                user_id: user?.id,
                email: user?.email,
                error: authError?.message,
            },
            prisma_db: {
                user_exists: !!prismaUser,
                user: prismaUser,
            }
        })
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
        }, { status: 500 })
    }
}
