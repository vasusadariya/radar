"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { setLeadStatus } from "@/app/actions";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/statuses";

export type KanbanCard = {
  id: string;
  status: LeadStatus;
  company: string;
  title: string;
  score: number;
  source: "FUNDING" | "POST" | "MANUAL";
};

const SOURCE_DOT = { FUNDING: "bg-violet-500", POST: "bg-sky-500", MANUAL: "bg-zinc-400" } as const;

export function Kanban({ cards }: { cards: KanbanCard[] }) {
  const [, start] = useTransition();
  const [optimistic, move] = useOptimistic(cards, (state, { id, status }: { id: string; status: LeadStatus }) =>
    state.map((c) => (c.id === id ? { ...c, status } : c)),
  );
  const [over, setOver] = useState<LeadStatus | null>(null);

  const drop = (status: LeadStatus, id: string) => {
    setOver(null);
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.status === status) return;
    start(async () => {
      move({ id, status });
      await setLeadStatus(id, status);
    });
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
      <div className="flex min-w-max gap-3">
        {LEAD_STATUSES.map((status) => {
          const col = optimistic.filter((c) => c.status === status);
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => drop(status, e.dataTransfer.getData("text/plain"))}
              className={`flex w-60 shrink-0 flex-col rounded-xl border p-2 transition-colors ${
                over === status ? "border-zinc-900 bg-zinc-100" : "border-zinc-200 bg-zinc-100/60"
              } ${status === "DEAD" ? "opacity-70" : ""}`}
            >
              <header className="flex items-center justify-between px-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {STATUS_LABEL[status]}
                <span className="tabular-nums">{col.length}</span>
              </header>
              <div className="mt-1 flex min-h-24 flex-col gap-2">
                {col.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                    className="cursor-grab rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${SOURCE_DOT[c.source]}`} title={c.source} />
                      <Link href={`/leads/${c.id}`} className="truncate text-sm font-medium hover:underline">
                        {c.company}
                      </Link>
                      <span className="ml-auto text-xs tabular-nums text-zinc-500">{c.score}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{c.title}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
