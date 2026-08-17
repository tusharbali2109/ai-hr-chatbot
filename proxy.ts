import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/** Candidate-facing routes are a separate auth realm from the recruiter
 * dashboard — candidates get a Supabase-auth session too (magic link, see
 * lib/services/candidate-auth.ts) but never a `users` row, so they must
 * never be redirected into /dashboard, and an unauthenticated visitor to
 * /candidate/* must land on /candidate/login, not the recruiter /login. */
const CANDIDATE_PREFIX = "/candidate";
const CANDIDATE_PUBLIC_PATHS = ["/candidate/login", "/candidate/auth/callback"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isCandidateRoute = pathname.startsWith(CANDIDATE_PREFIX);

  if (isCandidateRoute) {
    const isCandidatePublicPath = CANDIDATE_PUBLIC_PATHS.some((path) => pathname.startsWith(path));

    if (!user && !isCandidatePublicPath) {
      const loginUrl = new URL("/candidate/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user && pathname === "/candidate/login") {
      return NextResponse.redirect(new URL("/candidate", request.url));
    }

    return response;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
