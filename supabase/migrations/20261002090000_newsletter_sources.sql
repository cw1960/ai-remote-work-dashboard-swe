-- Newsletter-only sources (newsletter N3): Invisible and Welo Data (already
-- listed) and xAI (new), read from their official Greenhouse and Lever job
-- boards. Vetted 2026-10-02 (robots.txt and terms; PLAN.md → Newsletter).
-- None has a referral program, so their jobs never appear on the site:
-- newsletter_only is set on the platform before any job is fetched.
-- Additive only: one new platform row, a flag on three, three cron jobs.
-- Each source runs every 6 hours at its own minute, like mercor (:07) and
-- micro1 (:37).
insert into public.platforms (slug, name, site_url, onboarding_notes, newsletter_only)
values
  ('xai', 'xAI', 'https://job-boards.greenhouse.io/xai',
   'AI tutor roles for Grok are posted on xAI''s job board; apply to each role separately.',
   true)
on conflict (slug) do nothing;

update public.platforms
set newsletter_only = true
where slug in ('invisible', 'welo-data', 'xai');

select cron.schedule('ingest-invisible', '17 */6 * * *', $$select private.invoke_ingest('invisible')$$);
select cron.schedule('ingest-welo-data', '27 */6 * * *', $$select private.invoke_ingest('welo-data')$$);
select cron.schedule('ingest-xai', '47 */6 * * *', $$select private.invoke_ingest('xai')$$);
