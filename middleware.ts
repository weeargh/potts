import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Ensure user record exists in public.users table (for foreign key constraints)
  if (user) {
    try {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email || "",
          ...(user.user_metadata?.name && { name: user.user_metadata.name }),
          ...(user.user_metadata?.avatar_url && { avatarUrl: user.user_metadata.avatar_url }),
        },
        create: {
          id: user.id,
          email: user.email || "",
          ...(user.user_metadata?.name && { name: user.user_metadata.name }),
          ...(user.user_metadata?.avatar_url && { avatarUrl: user.user_metadata.avatar_url }),
        },
      })
    } catch (error) {
      // Log error but don't block request
      console.error("Failed to sync user to database:", error)
    }
  }

  // Protected routes - require authentication
  if (!user && request.nextUrl.pathname.startsWith("/meetings")) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/login"
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect to dashboard if already logged in and trying to access login
  if (user && request.nextUrl.pathname === "/login") {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/"
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
