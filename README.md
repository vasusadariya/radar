# Radar

A personal job-hunt command center. It catches freshly funded startups and fresh hiring posts, scores them against your profile, and tracks every lead from first sight to offer — all on free tiers.

**Phase 1:** tracker + automatic funding feed. **Phase 2:** Easy Apply (research → people → emails → Gmail drafts). **Phase 3:** hiring-post capture, reply tracking, follow-ups.

- **Radar** — inbox of new leads, scored 0–100 for fit, filterable by source
- **Pipeline** — drag-and-drop kanban: New → Researched → Contacts found → Drafted → Sent → Replied → Interview → Offer / Dead
- **Funding worker** — every 3 hours, reads TechCrunch, Inc42, Entrackr and YourStory, asks Gemini which items are funding rounds, extracts company/round/amount/investors, scores fit, dedupes across outlets
- **Profile** — targeting questions (roles, internship vs full-time, stages, locations, comp floor) that drive scoring, plus resume variants per role
- **Outreach / Stats** — email log and reply rate by channel (fills up in Phase 2)

- **Easy Apply (Run)** — reads the source article, the company homepage and its team/about pages; writes a brief and picks up to 3 named people (post author, founders, eng lead); finds emails (Hunter → Apollo if keyed, else MX-checked pattern guesses marked *Guessed*); drafts one ≤5-line email per person with the role-matched resume attached and puts it in your Gmail drafts. It never sends: each draft has its own Send (confirm + 15/day cap).

- **Capture (bookmarklet)** — install from the **Capture** page. On a LinkedIn or X post, select a bit of its text and click *Save to Radar*: a Radar tab opens, the AI checks it's a real hiring post for your roles, shows its age and likes (fresh = under a day, quiet = under 100 likes), and *Save & Run* drafts an email to the poster. The button only reads the page you're on; Radar never logs in to or scrapes LinkedIn/X.
- **Replies & follow-ups** — Radar reads the Gmail threads it sent into. A reply moves the lead to *Replied* and shows on Outreach and the lead page. No reply after 3 days (`FOLLOW_UP_DAYS`) → one short follow-up is drafted in the same thread for you to review and send. Checks run when you open Outreach (at most every 20 min), on *Check replies now*, and daily via Vercel cron (set `CRON_SECRET` in Vercel to enable it).

### Gmail setup (once)

1. Google Cloud → APIs & Services: enable the **Gmail API**.
2. Google Auth Platform: External app in *Testing*, your Gmail added as a test user.
3. Clients → Web application, redirect URIs `https://radar.vasusadariya.dev/api/google/callback` (plus the old `https://radar-lovat-iota.vercel.app/...`, which now redirects) and `http://localhost:3000/api/google/callback`.
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel, redeploy, then **Profile → Connect Gmail**.

In *Testing* mode Google expires the connection after 7 days; reconnect from Profile, or publish the app (it will show an "unverified app" warning that only you will see).

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
