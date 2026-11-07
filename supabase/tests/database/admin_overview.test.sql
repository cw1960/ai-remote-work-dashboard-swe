-- Admin area: admins only, and the figures add up.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email, created_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'boss@example.com', now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000000b1', 'reader@example.com', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000c1', 'third@example.com', now() - interval '20 days');
insert into private.admins (email) values ('boss@example.com');

update public.profiles set onboarded_at = now(), last_dashboard_at = now()
where user_id = '00000000-0000-0000-0000-0000000000b1';
insert into public.tracker_cards (user_id, kind, title, applied_at)
values ('00000000-0000-0000-0000-0000000000b1', 'manual', 'Applied', now()),
       ('00000000-0000-0000-0000-0000000000b1', 'manual', 'Saved', null);

insert into public.site_events (event, source, utm_source, utm_campaign, at)
values ('newsletter_signup', 'footer', 'linkedin', 'launch', now() - interval '1 day'),
       ('newsletter_signup', 'footer', 'linkedin', 'launch', now() - interval '10 days'),
       ('newsletter_signup', 'job', null, null, now() - interval '40 days');

select public.ingest_jobs('xai', now() - interval '3 hours',
  '[{"external_id": "h-1", "title": "AI Tutor", "url": "https://example.com/h-1"}]');
select public.ingest_jobs('xai', now() - interval '2 hours', '[]', 0, 'HTTP 503');
select public.ingest_jobs('xai', now() - interval '1 hour', '[]', 0, 'HTTP 503');

select ok(exists (select 1 from private.admins where email = 'editor@example.com'),
  'the editor is an admin');

-- A reader --------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select throws_ok($$ select public.admin_site_stats() $$, '42501', null,
  'readers cannot see site figures');
select throws_ok($$ select * from public.admin_signup_stats() $$, '42501', null,
  'readers cannot see signup figures');
select throws_ok($$ select * from public.admin_source_health() $$, '42501', null,
  'readers cannot see source health');
select throws_ok($$ select * from public.admin_users() $$, '42501', null,
  'readers cannot list accounts');

-- An admin ----------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  public.admin_site_stats(),
  jsonb_build_object('accounts', 3, 'new_7d', 1, 'new_30d', 2, 'onboarded', 1,
                     'active_7d', 1, 'cards', 2, 'applied', 1),
  'site figures count accounts, new, onboarded and active ones, and cards'
);

select results_eq(
  $$ select source, utm_source, utm_campaign, last_7d, last_30d from public.admin_signup_stats() $$,
  $$ values ('footer'::text, 'linkedin'::text, 'launch'::text, 1, 2) $$,
  'signups in the last 30 days, by form and campaign'
);

select results_eq(
  $$ select last_found, last_error, failures_in_row, open_jobs
     from public.admin_source_health() where slug = 'xai' $$,
  $$ values (0, 'HTTP 503'::text, 2, 1) $$,
  'source health shows the latest run, the failures in a row and open jobs'
);

select results_eq(
  $$ select email, onboarded, cards, total from public.admin_users('example.com') $$,
  $$ values ('reader@example.com'::text, true, 2, 3),
            ('third@example.com', false, 0, 3),
            ('boss@example.com', false, 0, 3) $$,
  'accounts newest first, with profile and card counts'
);
select results_eq(
  $$ select email from public.admin_users('READER') $$,
  $$ values ('reader@example.com'::text) $$,
  'search ignores case'
);
select results_eq(
  $$ select email, total from public.admin_users('example.com', 1, 1) $$,
  $$ values ('third@example.com'::text, 3) $$,
  'paging keeps the total'
);
select is(
  (select count(*)::int from public.admin_users('%')),
  0,
  'a % in the search is literal'
);

-- Signed out --------------------------------------------------------------------

set local role anon;
select throws_ok($$ select * from public.admin_users() $$, '42501', null,
  'signed-out visitors cannot list accounts');

select * from finish();
rollback;
