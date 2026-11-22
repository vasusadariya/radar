import { cookies } from "next/headers";
import { consentUrl, googleConfigured } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!googleConfigured()) {
    return new Response("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see README).", { status: 503 });
  }
  const state = crypto.randomUUID();
  (await cookies()).set("radar_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return Response.redirect(consentUrl(new URL(req.url).origin, state), 302);
}
