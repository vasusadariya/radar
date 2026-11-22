import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const expected = await sessionToken();
  // No APP_PASSWORD set: open access (fine for local dev; README says to set it before deploying).
  if (!expected) return NextResponse.next();

  const got = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (safeEqual(got, expected)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/health|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
