import { runReplyCheck } from "@/pipeline/reply-check";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily Vercel cron (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReplyCheck(true);
  return Response.json(result);
}
