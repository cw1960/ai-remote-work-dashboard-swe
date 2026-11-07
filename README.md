# AI Remote Work Dashboard

A free, mobile-first web app for finding remote AI-training work and keeping
track of every application.

**Live site:** [airemoteworkdashboard.com](https://airemoteworkdashboard.com)

Browse open jobs from vetted platforms (Mercor, micro1, Invisible, Welo Data,
xAI, RemoExperts) without an account. Sign in with a magic link to track
applications on your own board, get reminders and job alerts, and tailor your
resume to a listing. **The tracker is the product; the job feed is the hook.**

The same database also powers the sister newsletter,
**The Post-Human Countdown**, whose code lives in
[`cw1960/airemoteworktoday`](https://github.com/cw1960/airemoteworktoday).

---

## Features

**For visitors (no account needed)**

- Job feed with search and filters (platform, field, pay, language, country,
  date posted), all in the URL so searches can be shared
- One page per job (with JobPosting structured data for search engines) and
  one page per platform explaining how joining works
- "Apply" links go through `/go/<job-id>`, which records the click and adds a
  referral code where the platform has a referral program, with a visible
  affiliate notice

**For signed-in users**

- **Dashboard**:
  - **Today panel:** follow-ups due, assessments, new matches, jobs that
    closed
  - **Platform Passport:** your status on each platform, with reapply dates
  - **Matched jobs:** ranked by fit, each with plain-language reasons
  - **Pipeline:** a six-column board (drag and drop on desktop, tabs and a
    Move menu on mobile), with stats
- **Card details:** dates, notes, stage history, and a platform playbook
  saying what usually comes next
- **All jobs page:** the full feed inside the app
- **Email:**
  - a welcome email, follow-up reminders, saved-search alerts and a weekly
    recap;
  - one-click unsubscribe on every email.
- **Email auto-capture:** forward a platform's email to your private
  `track+…@mail.airemoteworkdashboard.com` address and your board updates;
  unclear emails wait under "Forwarded emails" for you to file.
- **Resume tailoring:**
  - upload or paste a master resume, then generate a version tailored to a
    job;
  - it never invents facts and flags anything not backed by your resume;
  - review, edit and download as Word or PDF;
  - limited to 5 per day.
- **Newsletter signup** (Beehiiv) in the footer, on job pages and on the
  dashboard

**For admins** (`/admin`, hidden from everyone else)

- Site and signup figures, job source health, users, hand-picked listings,
  and the newsletter workflow's runs, costs, job picks and social drafts

**Also in this repo:** the sales page for _The AI Remote Work Playbook_ at
`playbook.airemoteworkdashboard.com` (Stripe checkout).

V1 is completely free: no paywalls, no Pro tier.

---

## Tech stack

| Area       | What we use                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Web app    | Next.js 16 (App Router), TypeScript (strict), Tailwind CSS v4, shadcn/ui                                  |
| i18n       | next-intl (English today; every string is translatable)                                                   |
| Hosting    | Netlify (pushes to `main` deploy production; PRs get preview URLs)                                        |
| Backend    | Supabase: Postgres, Auth (magic link), row-level security, Edge Functions (Deno), pg_cron                 |
| Email      | Resend (app emails, React Email templates, inbound auto-capture)                                          |
| Newsletter | Beehiiv                                                                                                   |
| AI         | Claude API, for resume tailoring only                                                                     |
| Payments   | Stripe, for the Playbook only                                                                             |
| Tests      | Vitest (logic), Playwright with axe accessibility checks (key flows), pgTAP (database and security rules) |
| CI         | `pnpm check` locally before every commit                                                                  |

---

## Project structure

```
src/
  app/[locale]/        Pages (feed, jobs, platforms, dashboard, resume, settings, admin, legal…)
  app/api/             Route handlers (cron emails, unsubscribe, newsletter, Playbook, downloads)
  app/go/[id]/         Tracked "Apply" redirect
  components/          UI components (shadcn/ui in components/ui)
  config/site.ts       Brand, domains and contact details: the one place to change them
  emails/              React Email templates
  lib/                 Queries, server actions and pure logic, grouped by feature
  styles/tokens.css    Design tokens (colors, type, spacing, radii)
messages/en.json       All user-facing text
supabase/
  migrations/          Database schema, RLS policies and SQL functions
  functions/           Edge Functions: ingest, inbound-email, tailor-resume,
                       job-description, newsletter-image (+ _shared pure code)
  tests/database/      pgTAP tests
e2e/                   Playwright tests (mobile + desktop)
scripts/               Small build helpers
```

---

## Getting started (local development)

You need **Node 22** (see `.nvmrc`), **pnpm**, **Docker** (for the local
Supabase stack) and, for Edge Function checks, **Deno 2**.

```bash
pnpm install

# Start the local Supabase stack (Postgres, Auth, Mailpit…) and seed sample jobs
pnpm db:start

# Copy the env template and fill in the URL and anon key printed by db:start
cp .env.example .env.local

pnpm dev            # http://localhost:3000
```

Sign-in emails sent locally land in **Mailpit** at http://127.0.0.1:54324.

Emails, newsletter signups, payments and resume tailoring are switched off
unless their keys are set: locally, in CI and on deploy previews, nothing
real is sent or charged. Every variable is documented in
[`.env.example`](.env.example). Never commit secrets.

### Commands

| Command                             | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                          | Dev server on http://localhost:3000                                    |
| `pnpm build` / `pnpm start`         | Production build / serve it                                            |
| `pnpm check`                        | Lint + format check + typecheck + unit tests (run before every commit) |
| `pnpm lint`                         | ESLint (strict, plus accessibility rules), zero warnings               |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                                 |
| `pnpm typecheck`                    | Generate route types, then `tsc --noEmit`                              |
| `pnpm test`                         | Vitest unit tests                                                      |
| `pnpm test:e2e`                     | Playwright tests against the production build (`pnpm build` first)     |
| `pnpm functions:check`              | `deno check` + `deno lint` for the Edge Functions                      |
| `pnpm db:start` / `pnpm db:stop`    | Start / stop the local Supabase stack                                  |
| `pnpm db:reset`                     | Re-apply all migrations and the seed locally                           |
| `pnpm db:test`                      | pgTAP database tests                                                   |
| `pnpm db:types`                     | Regenerate `src/lib/supabase/database.types.ts`                        |

---

## How data flows

- **Job ingestion:**
  - every 6 hours, pg_cron calls the `ingest` Edge Function once per
    platform;
  - its adapters read official job-board APIs or public endpoints, politely
    (one light request per run, a clear User-Agent, backing off on errors);
  - jobs are upserted, and jobs unseen for 2 runs are marked closed, never
    deleted;
  - an adapter that returns zero jobs sends an alert email instead of
    closing everything.
- **Matching:** one Postgres function, `match_jobs`, scores jobs against a
  profile. The feed and the dashboard share it. It is rules-based, with no AI.
- **Scheduled emails:** pg_cron calls the app's `/api/cron/*` routes with a
  token kept in Supabase Vault. The routes read through token-gated SQL
  functions, so the web app never holds the database's service role key.
- **Security:**
  - row-level security on every table;
  - Zod validation at every server boundary;
  - user data is visible only to its owner;
  - admin functions check an allow-list.

---

## Deploying

- **Web app:** merging a PR into `main` deploys to Netlify automatically.
- **Database and Edge Functions:** deployed by hand with the Supabase CLI
  (`supabase db push`, `supabase functions deploy`), never automatically.
- **Migration rules:** additive and safe on live data, merged only after CI
  passes.
- **One hosted Supabase project:** production. Develop against the local
  stack, never against production.

**CI:** every PR should run lint, format, typecheck, unit tests, Edge Function
checks, the build, the Playwright suite and the pgTAP tests. A PR is merged
only when all of it is green.

---

## Contributing

- Work in small, reviewable PRs.
- Run `pnpm check` before committing; CI must be green before merging.
- **Accessibility:** WCAG 2.2 AA, full keyboard support, respect for reduced
  motion.
- **States:** loading states use skeletons, never spinners, and every empty
  and error state is designed.
- **Text:** all user-facing text goes in `messages/en.json`.
- **Config:** brand, domains and contact details live only in
  `src/config/site.ts`.
- **New job sources** need the platform's robots.txt **and** terms checked
  first. Competitor job boards are never scraped.

---

## Operator

Run by **El Barrial Devs**, Santiago, Nuevo León, Mexico. See the site's
[Terms](https://airemoteworkdashboard.com/legal/terms),
[Privacy Notice](https://airemoteworkdashboard.com/legal/privacy) and
[Affiliate disclosure](https://airemoteworkdashboard.com/legal/affiliates).
