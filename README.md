# Radar

A personal job-hunt command center. It catches freshly funded startups and fresh hiring posts, scores them against your profile, and tracks every lead from first sight to offer — all on free tiers.

**Phase 1 (this commit):** tracker + automatic funding feed.

- **Radar** — inbox of new leads, scored 0–100 for fit, filterable by source
- **Pipeline** — drag-and-drop kanban: New → Researched → Contacts found → Drafted → Sent → Replied → Interview → Offer / Dead
- **Funding worker** — every 3 hours, reads TechCrunch, Inc42, Entrackr and YourStory, asks Gemini which items are funding rounds, extracts company/round/amount/investors, scores fit, dedupes across outlets
- **Profile** — targeting questions (roles, internship vs full-time, stages, locations, comp floor) that drive scoring, plus resume variants per role
- **Outreach / Stats** — email log and reply rate by channel (fills up in Phase 2)

**Phase 2** adds the Run button: research → pick 3 people → email waterfall (pattern + Apollo/Prospeo/Hunter) → Gmail draft with the matching resume attached. **Phase 3** adds the 1-click capture bookmarklet for LinkedIn/X posts, reply watching and follow-ups.

## Stack

Next.js 15 (App Router, server actions) · Drizzle ORM · Supabase Postgres + Storage · Gemini (Groq fallback) · GitHub Actions cron · Tailwind v4

## Setup (~15 minutes)

1. **Supabase** — create a free project. Copy the two connection strings (Settings → Database) and the project URL + `service_role` key (Settings → API).
2. **Gemini** — get a free API key at [aistudio.google.com](https://aistudio.google.com/apikey).
3. **Local env** — `cp .env.example .env.local` and fill it in.
4. **Install and migrate**
   ```bash
   npm install
   npm run db:migrate
   ```
5. **Pull funding news once** to fill the Radar:
   ```bash
   npm run ingest:funding
   ```
6. **Run** — `npm run dev`, open http://localhost:3000, fill in **Profile** first (it changes scoring), upload your resumes.

### Deploy

- **Vercel** — import this repo, add every variable from `.env.example` (set `APP_PASSWORD`, since the site is otherwise public).
- **GitHub Actions** — repo Settings → Secrets and variables → Actions → add secrets `DATABASE_URL`, `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`). The `Ingest funding news` workflow then runs every 3 hours; trigger it manually from the Actions tab to test.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run ingest:funding` | One funding-feed run (same as the cron) |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
| `npm test` | Unit tests; `RUN_DB_TESTS=1` also runs the worker test (**truncates tables** — use a throwaway DB) |

## How scoring works

`fit` (0–100, from the LLM, judged against your Profile) + stage bonus (pre-seed/seed +10, Series B+ −15, public −25) − 20 if the stage isn't in your selected stages − 10/−25 for news older than 3/10 days. Tune it in `src/lib/scoring.ts`.

## Layout

```
src/db/schema.ts        all tables
src/worker/funding.ts   RSS → prefilter → LLM extract → score → dedupe → save
src/lib/llm.ts          Gemini/Groq JSON client with retries + fallback
src/app/                pages + server actions
.github/workflows/      3-hourly cron
```
