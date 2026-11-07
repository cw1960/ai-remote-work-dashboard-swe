-- Newsletter-only jobs: stored with the others, never shown on the site.
-- Mercor and micro1 jobs stay on the site (and in the newsletter).
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000a1', 'nl-a@example.com');

update public.profiles set domains = '{law}'
where user_id = '00000000-0000-0000-0000-0000000000a1';

select results_eq(
  $$ select slug, newsletter_only, listed from public.platforms
     where slug in ('invisible', 'mercor', 'micro1', 'remoexperts', 'welo-data', 'xai') order by slug $$,
  $$ values ('invisible'::text, false, true), ('mercor', false, true), ('micro1', false, true),
            ('remoexperts', false, true), ('welo-data', false, true), ('xai', false, true) $$,
  'the vetted sources are listed and on the site'
);
select throws_ok(
  $$ update public.platforms set newsletter_only = true where slug = 'xai' $$,
  '23514', null, 'a listed platform cannot be newsletter-only'
);

-- xAI stands in for a newsletter-only source from here on.
update public.platforms set listed = false, newsletter_only = true where slug = 'xai';

select public.ingest_jobs('xai', now() - interval '1 minute',
  '[{"external_id": "x-1", "title": "Zebrafish AI Tutor", "domain": "law", "url": "https://example.com/x-1"}]');
select public.ingest_jobs('mercor', now() - interval '1 minute',
  '[{"external_id": "m-1", "title": "Zebrafish Law Expert", "domain": "law", "url": "https://example.com/m-1"}]');

create temporary table ids (slug text, id uuid) on commit drop;
insert into ids
select p.slug, j.id from public.jobs j join public.platforms p on p.id = j.platform_id
where j.external_id in ('x-1', 'm-1');
grant select on ids to anon, authenticated;

select results_eq(
  $$ select j.external_id, j.newsletter_only from public.jobs j
     where j.external_id in ('x-1', 'm-1') order by 1 $$,
  $$ values ('m-1'::text, false), ('x-1', true) $$,
  'ingested jobs take their platform''s setting'
);

insert into public.saved_searches (user_id, filters, created_at)
values ('00000000-0000-0000-0000-0000000000a1', '{"q": "Zebrafish"}', now() - interval '1 day');

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'cron_token';
grant select on t to anon;

-- Signed out ------------------------------------------------------------------

set local role anon;

select ok(exists (select 1 from public.jobs where id = (select id from ids where slug = 'mercor')),
  'anon reads Mercor jobs');
select ok(not exists (select 1 from public.jobs where id = (select id from ids where slug = 'xai')),
  'anon does not read newsletter-only jobs');
select ok(
  not (public.feed_facets() -> 'platforms') @> '[{"slug": "xai"}]',
  'feed filters leave newsletter-only platforms out'
);
select throws_ok(
  $$ select public.log_outbound_click((select id from ids where slug = 'xai')) $$,
  'P0002', null, '/go treats a newsletter-only job as not found'
);
select lives_ok(
  $$ select public.log_outbound_click((select id from ids where slug = 'mercor')) $$,
  '/go still works for Mercor jobs'
);
select is(
  (select total from public.due_job_alerts((select token from t), now())
   where email = 'nl-a@example.com'),
  1,
  'alerts count only site jobs'
);
select ok(
  (select not jobs @> jsonb_build_array(jsonb_build_object('id', (select id from ids where slug = 'xai')))
   from public.due_job_alerts((select token from t), now())
   where email = 'nl-a@example.com'),
  'alerts never list newsletter-only jobs'
);

-- Signed in -------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select ok(exists (select 1 from public.jobs where id = (select id from ids where slug = 'mercor')),
  'users read Mercor jobs');
select ok(not exists (select 1 from public.jobs where id = (select id from ids where slug = 'xai')),
  'users do not read newsletter-only jobs');
select results_eq(
  $$ select job_id from public.match_jobs() where job_id in (select id from ids) $$,
  $$ select id from ids where slug = 'mercor' $$,
  'matching suggests site jobs only'
);
select throws_ok(
  $$ insert into public.tracker_cards (kind, job_id, title)
     values ('job', (select id from ids where slug = 'xai'), 'AI Tutor') $$,
  'P0002', null, 'a newsletter-only job cannot be tracked'
);
select lives_ok(
  $$ insert into public.tracker_cards (kind, job_id, title)
     values ('job', (select id from ids where slug = 'mercor'), 'Law Expert') $$,
  'Mercor jobs can be tracked'
);

-- Moving a platform -------------------------------------------------------------

reset role;

update public.platforms set newsletter_only = false where slug = 'xai';
select is(
  (select newsletter_only from public.jobs where id = (select id from ids where slug = 'xai')),
  false,
  'a platform moved to the site takes its jobs along'
);
update public.platforms set newsletter_only = true where slug = 'xai';
select is(
  (select newsletter_only from public.jobs where id = (select id from ids where slug = 'xai')),
  true,
  'and back'
);

select * from finish();
rollback;
