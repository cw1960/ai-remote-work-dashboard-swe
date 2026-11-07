-- Sample jobs for local development and CI end-to-end tests. Runs on
-- `supabase db reset` / `supabase start` only; never pushed to production
-- (`supabase db push` does not include seeds). URLs point at example.com.
insert into public.jobs (id, platform_id, external_id, title, summary, domain, pay_min, pay_max, pay_unit, languages, countries, countries_blocked, url, posted_at, status, closed_at)
select md5(v.ext)::uuid, p.id, v.ext, v.title, v.summary, v.domain, v.lo, v.hi, v.unit::public.pay_unit, v.langs::text[], v.countries::text[], v.blocked::text[], v.url, v.posted::timestamptz, v.status::public.job_status,
       case when v.status = 'closed' then v.posted::timestamptz + interval '3 days' end
from (values
  ('mercor', 'seed-mercor-01', 'Litigation Associate', 'Sample listing for local development and tests (Litigation Associate).', 'law', 40, 50, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/1', '2026-09-02 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-02', 'Data Analyst', 'Sample listing for local development and tests (Data Analyst).', 'data', 50, 50, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/2', '2026-09-03 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-03', 'Graphic Designer', 'Sample listing for local development and tests (Graphic Designer).', 'arts-design', 20, 80, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/3', '2026-09-04 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-04', 'Python Code Reviewer', 'Sample listing for local development and tests (Python Code Reviewer).', 'software', 20, 40, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/4', '2026-09-05 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-05', 'Psychiatrist', 'Sample listing for local development and tests (Psychiatrist).', 'medicine', 60, 60, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/5', '2026-09-06 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-06', 'Mechanical Engineer', 'Sample listing for local development and tests (Mechanical Engineer).', 'engineering', 60, 70, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/6', '2026-09-07 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-07', 'Japanese Voice Recorder', 'Sample listing for local development and tests (Japanese Voice Recorder).', 'language', 20, 20, 'hour', '{ja,en}', '{US}', '{}', 'https://example.com/mercor/7', '2026-09-08 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-08', 'Financial Analyst', 'Sample listing for local development and tests (Financial Analyst).', 'finance', 50, 90, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/8', '2026-09-09 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-09', 'Operations Consultant', 'Sample listing for local development and tests (Operations Consultant).', 'business', 20, 30, 'task', '{}', '{}', '{}', 'https://example.com/mercor/9', '2026-09-10 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-10', 'Chemistry Expert', 'Sample listing for local development and tests (Chemistry Expert).', 'science', 20, 80, 'hour', '{}', '{}', '{IN}', 'https://example.com/mercor/10', '2026-09-11 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-11', 'Litigation Associate', 'Sample listing for local development and tests (Litigation Associate).', 'law', 50, 50, 'hour', '{}', '{MX,US}', '{}', 'https://example.com/mercor/11', '2026-09-12 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-12', 'Data Analyst', 'Sample listing for local development and tests (Data Analyst).', 'data', 100, 160, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/12', '2026-09-13 12:00:00+00', 'open'),
  ('mercor', 'seed-mercor-13', 'Graphic Designer', 'Sample listing for local development and tests (Graphic Designer).', 'arts-design', 20, 30, 'hour', '{}', '{}', '{}', 'https://example.com/mercor/13', '2026-09-14 12:00:00+00', 'closed'),
  ('mercor', 'seed-mercor-14', 'Python Code Reviewer', 'Sample listing for local development and tests (Python Code Reviewer).', 'software', 80, 140, 'hour', '{}', '{US}', '{}', 'https://example.com/mercor/14', '2026-09-15 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-01', 'Psychiatrist', 'Sample listing for local development and tests (Psychiatrist).', 'medicine', 20, 80, 'hour', '{}', '{}', '{}', 'https://example.com/micro1/1', '2026-09-16 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-02', 'Mechanical Engineer', 'Sample listing for local development and tests (Mechanical Engineer).', 'engineering', 60, 100, 'hour', '{}', '{}', '{}', 'https://example.com/micro1/2', '2026-09-17 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-03', 'French Translator', 'Sample listing for local development and tests (French Translator).', 'language', 20, 30, 'hour', '{fr}', '{}', '{}', 'https://example.com/micro1/3', '2026-09-18 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-04', 'Financial Analyst', 'Sample listing for local development and tests (Financial Analyst).', 'finance', 20, 80, 'task', '{}', '{}', '{}', 'https://example.com/micro1/4', '2026-09-19 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-05', 'Operations Consultant', 'Sample listing for local development and tests (Operations Consultant).', 'business', 100, 110, 'hour', '{}', '{}', '{}', 'https://example.com/micro1/5', '2026-09-20 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-06', 'Chemistry Expert', 'Sample listing for local development and tests (Chemistry Expert).', 'science', 40, 80, 'hour', '{}', '{}', '{IN}', 'https://example.com/micro1/6', '2026-09-21 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-07', 'Litigation Associate', 'Sample listing for local development and tests (Litigation Associate).', 'law', 30, 90, 'hour', '{}', '{US}', '{}', 'https://example.com/micro1/7', '2026-09-22 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-08', 'Data Analyst', 'Sample listing for local development and tests (Data Analyst).', 'data', 20, 80, 'hour', '{}', '{MX,US}', '{}', 'https://example.com/micro1/8', '2026-09-23 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-09', 'Graphic Designer', 'Sample listing for local development and tests (Graphic Designer).', 'arts-design', 40, 100, 'hour', '{}', '{}', '{}', 'https://example.com/micro1/9', '2026-09-24 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-10', 'Python Code Reviewer', 'Sample listing for local development and tests (Python Code Reviewer).', 'software', 100, 110, 'hour', '{}', '{}', '{}', 'https://example.com/micro1/10', '2026-09-25 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-11', 'Psychiatrist', 'Sample listing for local development and tests (Psychiatrist).', 'medicine', 20, 80, 'hour', '{}', '{}', '{}', 'https://example.com/micro1/11', '2026-09-26 12:00:00+00', 'open'),
  ('micro1', 'seed-micro1-12', 'Mechanical Engineer', 'Sample listing for local development and tests (Mechanical Engineer).', 'engineering', 60, 70, 'hour', '{}', '{}', '{}', 'https://example.com/micro1/12', '2026-09-27 12:00:00+00', 'closed')
) as v(slug, ext, title, summary, domain, lo, hi, unit, langs, countries, blocked, url, posted, status)
join public.platforms p on p.slug = v.slug;

-- Admins for the end-to-end tests of /admin/listings, one per Playwright
-- project (local and CI only, like everything in this file).
insert into private.admins (email)
values ('e2e-admin-mobile@example.com'), ('e2e-admin-desktop@example.com')
on conflict (email) do nothing;

-- A sample newsletter run with a shortlist and social drafts, for the
-- end-to-end test of /admin/newsletter. It cost nothing, so it never
-- changes the cost figures that tests check.
with run as (
  insert into public.newsletter_runs (id, kind, issue_date, finished_at, status)
  values (md5('seed-newsletter-run')::uuid, 'weekly', current_date, now(), 'succeeded')
  returning id
)
insert into public.job_shortlists (run_id, job_id, rank, reason, caveats)
select run.id, md5('seed-mercor-12')::uuid, 1,
  'Highest advertised hourly rate this week.', 'Wide pay range.'
from run;

insert into public.social_drafts (run_id, channel, body)
values
  (md5('seed-newsletter-run')::uuid, 'linkedin',
   E'New AI training roles this week.\nData analysts are in demand.'),
  (md5('seed-newsletter-run')::uuid, 'x', 'Data analyst roles advertised at up to $160/hr this week.');
