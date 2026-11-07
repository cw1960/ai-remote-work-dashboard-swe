-- RemoExperts (rex.zone): newsletter-only source (newsletter N3). Vetted
-- 2026-10-02: robots.txt allows everything and the site has no terms page
-- (PLAN.md → Newsletter). It has no referral program, so its jobs never
-- appear on the site. One request per run to the JSON endpoint behind the
-- public Open Opportunities page, every 6 hours at its own minute.
insert into public.platforms (slug, name, site_url, onboarding_notes, newsletter_only)
values
  ('remoexperts', 'RemoExperts', 'https://www.rex.zone/open-opportunities',
   'Create a talent profile on rex.zone and pass the skills assessment; roles are open to verified users only.',
   true)
on conflict (slug) do nothing;

update public.platforms set newsletter_only = true where slug = 'remoexperts';

select cron.schedule('ingest-remoexperts', '57 */6 * * *', $$select private.invoke_ingest('remoexperts')$$);
