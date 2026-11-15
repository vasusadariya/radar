import { and, desc, eq, gte, ne, or } from "drizzle-orm";
import { db, companies, leads } from "@/db";
import { Kanban, type KanbanCard } from "@/components/kanban";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  // Dead cards only from the last 14 days so the column doesn't grow forever.
  const deadCutoff = new Date(Date.now() - 14 * 86_400_000);
  const rows = await db
    .select({
      id: leads.id,
      status: leads.status,
      title: leads.title,
      score: leads.score,
      source: leads.source,
      company: companies.name,
    })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .where(or(ne(leads.status, "DEAD"), and(eq(leads.status, "DEAD"), gte(leads.updatedAt, deadCutoff))))
    .orderBy(desc(leads.score), desc(leads.createdAt))
    .limit(500);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-zinc-500">
          Drag cards between columns. In Phase 2 the Run button moves them automatically.
        </p>
      </div>
      <Kanban cards={rows as KanbanCard[]} />
    </div>
  );
}
