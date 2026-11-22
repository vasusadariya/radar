import { eq } from "drizzle-orm";
import { db, leads } from "@/db";

export const dynamic = "force-dynamic";

/** Tiny endpoint the Run button polls while Easy Apply is running (instead of re-rendering the page). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const [row] = await db
    .select({ runState: leads.runState, runStep: leads.runStep, runError: leads.runError, status: leads.status })
    .from(leads)
    .where(eq(leads.id, id));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row, { headers: { "cache-control": "no-store" } });
}
