import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("radar_oauth_state")?.value;
  jar.delete({ name: "radar_oauth_state", path: "/api/google" });
  const back = (q: string) => Response.redirect(new URL(`/profile?${q}`, url.origin), 302);

  if (url.searchParams.get("error")) return back(`gmail=denied`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("gmail=bad_state");
  try {
    await exchangeCode(code, url.origin);
    return back("gmail=connected");
  } catch (err) {
    return back(`gmail=error&detail=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
  }
}
