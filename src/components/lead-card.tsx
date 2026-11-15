import Link from "next/link";
import type { Company, Lead } from "@/db/schema";
import { SOURCE_LABEL, SOURCE_STYLE, scoreStyle, timeAgo } from "@/lib/format";
import { DismissButton, StatusSelect } from "./status-select";

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`chip tabular-nums ${scoreStyle(score)}`} title="Fit score (0–100)">
      {score}
    </span>
  );
}

export function LeadCard({ lead, company }: { lead: Lead; company: Company }) {
  const details = [company.fundingRound, company.fundingAmount, company.sector, company.geo].filter(Boolean);
  return (
    <article className="card p-4">
      <div className="flex items-start gap-3">
        <ScoreBadge score={lead.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/leads/${lead.id}`} className="font-semibold hover:underline">
              {company.name}
            </Link>
            <span className={`chip ${SOURCE_STYLE[lead.source]}`}>{SOURCE_LABEL[lead.source]}</span>
            <span className="text-xs text-zinc-500">{timeAgo(lead.createdAt)}</span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-800">{lead.title}</p>
          {company.description && <p className="mt-1 text-sm text-zinc-600">{company.description}</p>}
          {details.length > 0 && <p className="mt-1 text-xs text-zinc-500">{details.join(" · ")}</p>}
          {lead.scoreReason && <p className="mt-1 text-xs italic text-zinc-500">Why: {lead.scoreReason}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <button
          type="button"
          className="btn-primary px-2.5 py-1 text-xs"
          disabled
          title="Easy Apply (research → contacts → email draft) arrives in Phase 2"
        >
          Run
        </button>
        <Link href={`/leads/${lead.id}`} className="btn-ghost px-2.5 py-1 text-xs">
          Open
        </Link>
        {lead.postUrl && (
          <a href={lead.postUrl} target="_blank" rel="noreferrer" className="btn-ghost px-2.5 py-1 text-xs">
            Source ↗
          </a>
        )}
        {company.domain && (
          <a
            href={`https://${company.domain}`}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost px-2.5 py-1 text-xs"
          >
            {company.domain} ↗
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          <StatusSelect leadId={lead.id} status={lead.status} />
          {lead.status !== "DEAD" && <DismissButton leadId={lead.id} />}
        </div>
      </div>
    </article>
  );
}
