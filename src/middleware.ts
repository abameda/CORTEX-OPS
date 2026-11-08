import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase-config";

// Lives in src/ next to src/app: Next.js ignores a root-level middleware.ts when
// the app directory is inside src/, which left every route unauthenticated.
//
// This is the first line of defense only. Every page and API route also checks
// authentication and staff membership itself (src/lib/auth.ts), and RLS enforces
// the staff allowlist in the database.
export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Service unavailable: authentication is not configured.", {
        status: 503,
      });
    }

    // Local preview mode only (next dev without Supabase keys).
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  // Public: static assets, the login page, signed webhooks, and the token-gated
  // call start endpoint (each of those authenticates the request itself).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|login(?:/|$)|api/webhooks/|api/call/).*)",
  ],
};
