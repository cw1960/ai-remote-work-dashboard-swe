-- Hand-picked listings: admins only, always newsletter-only, never closed
-- by ingestion.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Editor@Example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'reader@example.com');
insert into private.admins (email) values ('editor@example.com');

select ok(exists (select 1 from private.admins where email = 'owner@example.com'),
  'the owner is an admin');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant select, insert on ids to authenticated;

-- A reader (signed in, not an admin) --------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select is(public.is_admin(), false, 'a reader is not an admin');
select throws_ok($$ select * from public.admin_platforms() $$,
  '42501', null, 'readers cannot list platforms');
select throws_ok($$ select * from public.admin_listings() $$,
  '42501', null, 'readers cannot list listings');
select throws_ok(
  $$ select public.admin_save_listing(null, 'Acme', 'Tutor', 'https://acme.example/jobs/1',
       '', null, null, null, '{}', null, null) $$,
  '42501', null, 'readers cannot add listings');
select throws_ok($$ select public.admin_close_listing(gen_random_uuid()) $$,
  '42501', null, 'readers cannot close listings');

-- The editor ----------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(public.is_admin(), true, 'the editor is an admin (email case ignored)');

insert into ids
select 'outlier', public.admin_save_listing(
  (select id from public.admin_platforms() where slug = 'outlier'), '',
  'Physics Expert', 'https://outlier.ai/jobs/physics', 'Grade physics answers.',
  40, 60, 'hour', '{US}', '2026-10-01', '2026-10-03');
insert into ids
select 'new-company', public.admin_save_listing(
  null, 'Atlas Capture', 'Video Collector', 'https://atlas.example/jobs/1/?ref=x',
  '', null, null, null, '{}', null, null);

select is((select count(*)::int from public.admin_listings()), 2,
  'the editor sees both listings');
select results_eq(
  $$ select status::text, verified_at from public.admin_listings()
     where id = (select id from ids where name = 'outlier') $$,
  $$ values ('open'::text, '2026-10-03'::timestamptz) $$,
  'a saved listing is open, with its checked date'
);
select ok(
  exists (select 1 from public.admin_listing_candidates(null, 'https://outlier.ai/jobs/physics/')
          where id = (select id from ids where name = 'outlier')),
  'candidates match the same address despite a trailing slash'
);

insert into ids
select 'review', public.admin_save_listing(
  (select id from public.admin_platforms() where slug = 'outlier'), '',
  'Physics Expert (PhD)', 'https://outlier.ai/jobs/physics-phd', '',
  null, null, null, '{}', null, null,
  (select id from ids where name = 'outlier'));
select ok(public.admin_resolve_listing((select id from ids where name = 'review'), true),
  'the editor keeps a listing under review');
select is(public.admin_close_listing((select id from ids where name = 'review')), true,
  'the editor closes a listing');
select is(public.admin_update_listing((select id from ids where name = 'review'),
  'x', 'https://outlier.ai/x', '', null, null, null, '{}', null, null), false,
  'a closed listing is not updated');

-- Signed out: hand-picked listings never reach the site ---------------------

set local role anon;
select is((select count(*)::int from public.jobs where source = 'manual'), 0,
  'anon sees no hand-picked listings');

reset role;

select results_eq(
  $$ select bool_and(newsletter_only) from public.jobs where source = 'manual' $$,
  $$ values (true) $$,
  'hand-picked listings are newsletter-only, even on a site platform'
);
select results_eq(
  $$ select newsletter_only, site_url from public.platforms where slug = 'atlas-capture' $$,
  $$ values (true, 'https://atlas.example'::text) $$,
  'a new company becomes a newsletter-only platform'
);
select throws_ok(
  $$ update public.jobs set source = 'manual', newsletter_only = false
     where id = (select id from ids where name = 'outlier') $$,
  '23514', null, 'a hand-picked listing cannot be made site-visible'
);

-- Ingestion never closes hand-picked listings --------------------------------

-- Old enough that the closing rule would catch it if it applied.
update public.jobs set last_seen_at = now() - interval '3 days'
where id = (select id from ids where name = 'outlier');

select public.ingest_jobs('outlier', now() - interval '2 days',
  '[{"external_id": "feed-1", "title": "Feed job", "url": "https://outlier.ai/feed/1"}]');
select public.ingest_jobs('outlier', now() - interval '1 day',
  '[{"external_id": "feed-1", "title": "Feed job", "url": "https://outlier.ai/feed/1"}]');
select public.ingest_jobs('outlier', now() - interval '1 hour',
  '[{"external_id": "feed-1", "title": "Feed job", "url": "https://outlier.ai/feed/1"}]');
select is(
  (select status::text from public.jobs where id = (select id from ids where name = 'outlier')),
  'open',
  'ingestion leaves hand-picked listings open'
);

-- Moving the platform to the site leaves them newsletter-only ----------------

update public.platforms set newsletter_only = true where slug = 'outlier';
update public.platforms set newsletter_only = false where slug = 'outlier';
select is(
  (select newsletter_only from public.jobs where id = (select id from ids where name = 'outlier')),
  true,
  'platform changes never expose a hand-picked listing'
);
select is(
  (select newsletter_only from public.jobs where external_id = 'feed-1'),
  false,
  'while its fetched jobs follow the platform'
);

select * from finish();
rollback;
