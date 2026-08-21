import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/** The public careers site — no auth realm at all, visible whether or not
 * anyone is signed in (unlike /login, a signed-in recruiter previewing
 * their own careers page should not be bounced to /dashboard). */
const CAREERS_PREFIX = "/careers";

/** Candidate-facing routes are a separate auth realm from the recruiter
 * dashboard — candidates get a Supabase-auth session too (magic link, see
 * lib/services/candidate-auth.ts) but never a `users` row, so they must
 * never be redirected into /dashboard, and an unauthenticated visitor to
 * /candidate/* must land on /candidate/login, not the recruiter /login. */
const CANDIDATE_PREFIX = "/candidate";
const CANDIDATE_PUBLIC_PATHS = ["/candidate/login", "/candidate/auth/callback", "/candidate/pending-approval"];

/** Paths an "interview_only" candidate (see the `candidate_track` cookie set
 * in app/candidate/auth/callback/route.ts) is allowed to reach — everything
 * else under /candidate/* bounces back to the interview. This is the "no
 * dashboard, no other candidate pages reachable" requirement: a candidate
 * whose sole eligibility is the AI video interview should see nothing else. */
const INTERVIEW_ONLY_ALLOWED_PREFIXES = ["/candidate/video-interview", ...CANDIDATE_PUBLIC_PATHS];

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

  if (pathname.startsWith(CAREERS_PREFIX)) {
    return response;
  }

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

    if (user) {
      const track = request.cookies.get("candidate_track")?.value;
      const isAllowedForInterviewOnly = INTERVIEW_ONLY_ALLOWED_PREFIXES.some((path) => pathname.startsWith(path));
      if (track === "interview_only" && !isAllowedForInterviewOnly) {
        return NextResponse.redirect(new URL("/candidate/video-interview", request.url));
      }
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
