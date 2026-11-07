-- Access rules, tested as a signed-out visitor (anon), user A and user B.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com');

insert into public.jobs (id, platform_id, external_id, title, url)
select '00000000-0000-0000-0000-00000000a001', id, 'ext-1', 'Job', 'https://example.com/1'
from public.platforms where slug = 'mercor';

insert into public.ingest_runs (platform_id)
select id from public.platforms where slug = 'mercor';

insert into public.tracker_cards (id, user_id, kind, title)
values ('00000000-0000-0000-0000-00000000cb01', '00000000-0000-0000-0000-0000000000b1',
        'manual', 'B card');

insert into public.saved_searches (user_id, filters)
values ('00000000-0000-0000-0000-0000000000b1', '{"q":"b"}');

insert into public.inbound_emails (id, user_id, from_domain)
values
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-0000000000a1', 'mercor.com'),
  ('00000000-0000-0000-0000-00000000eb01', '00000000-0000-0000-0000-0000000000b1', 'mercor.com');

-- Signed out ----------------------------------------------------------------

set local role anon;

select is((select count(*)::int from public.platforms), 15, 'anon reads platforms');
select ok(exists (select 1 from public.jobs where id = '00000000-0000-0000-0000-00000000a001'),
  'anon reads jobs');
select lives_ok($$ select * from public.playbooks $$, 'anon reads playbooks');

select throws_ok($$ select * from public.profiles $$, '42501', null,
  'anon cannot read profiles');
select throws_ok($$ select * from public.tracker_cards $$, '42501', null,
  'anon cannot read tracker cards');
select throws_ok($$ select * from public.email_prefs $$, '42501', null,
  'anon cannot read email prefs');
select throws_ok($$ select * from public.ingest_runs $$, '42501', null,
  'anon cannot read ingest runs');
select throws_ok($$ select * from public.outbound_clicks $$, '42501', null,
  'anon cannot read outbound clicks');
select throws_ok($$ update public.jobs set title = 'x' $$, '42501', null,
  'anon cannot edit jobs');
select throws_ok($$ truncate public.jobs $$, '42501', null,
  'anon cannot truncate jobs');
select lives_ok($$ select public.log_outbound_click('00000000-0000-0000-0000-00000000a001') $$,
  'anon can log an outbound click');

reset role;

-- User A -----------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is((select count(*)::int from public.platforms), 15, 'users read platforms');

select results_eq($$ select user_id from public.profiles $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'A sees only their own profile');

update public.profiles set display_name = 'Ana';
select is((select display_name from public.profiles), 'Ana', 'A edits their own profile');

select throws_ok($$ update public.profiles set user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', null, 'A cannot change the profile owner');

select results_eq($$ select count(*)::int from public.email_prefs $$, $$ values (1) $$,
  'A sees only their own email prefs');
update public.email_prefs set alerts_on = false;
select is((select alerts_on from public.email_prefs), false, 'A turns off alerts');
select throws_ok($$ update public.email_prefs set inbound_token = repeat('a', 32) $$,
  '42501', null, 'A cannot change their inbound token');

-- Cards
select lives_ok($$
  insert into public.tracker_cards (kind, job_id, title)
  values ('job', '00000000-0000-0000-0000-00000000a001', 'A job card')
$$, 'A adds a card (owner defaults to A)');

select results_eq($$ select title from public.tracker_cards $$, $$ values ('A job card') $$,
  'A sees only their own cards');

select is((select count(*)::int from public.card_events), 1,
  'A sees the history of their own card only');

select throws_ok($$
  insert into public.tracker_cards (user_id, kind, title)
  values ('00000000-0000-0000-0000-0000000000b1', 'manual', 'planted')
$$, '42501', null, 'A cannot add a card for B');

select throws_ok($$ update public.tracker_cards set user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', null, 'A cannot hand a card to B');

update public.tracker_cards set stage = 'applied'
where id = '00000000-0000-0000-0000-00000000cb01';
delete from public.tracker_cards where id = '00000000-0000-0000-0000-00000000cb01';

select throws_ok($$
  insert into public.card_events (card_id, user_id, to_stage)
  select id, user_id, 'offered' from public.tracker_cards
$$, '42501', null, 'A cannot write card history directly');

select lives_ok($$ update public.tracker_cards set stage = 'applied' $$,
  'A moves their own card');
select is((select count(*)::int from public.card_events), 2,
  'moving a card records history through the trigger');

-- Saved searches and memberships
select lives_ok($$ insert into public.saved_searches (filters) values ('{"q":"a"}') $$,
  'A saves a search');
select is((select count(*)::int from public.saved_searches), 1,
  'A sees only their own saved searches');

select lives_ok($$
  insert into public.platform_memberships (platform_id, status)
  select id, 'applied' from public.platforms where slug = 'micro1'
$$, 'A adds a platform membership');

-- Inbound emails
select results_eq($$ select id from public.inbound_emails $$,
  $$ values ('00000000-0000-0000-0000-00000000ea01'::uuid) $$,
  'A sees only their own inbound emails');
select lives_ok($$ update public.inbound_emails set status = 'ignored' $$,
  'A resolves a Needs review email');
select throws_ok($$ insert into public.inbound_emails (from_domain) values ('x.com') $$,
  '42501', null, 'A cannot create inbound emails');

-- Admin-only tables
select throws_ok($$ select * from public.ingest_runs $$, '42501', null,
  'users cannot read ingest runs');
select throws_ok($$ insert into public.outbound_clicks (job_id, referrer_used)
                    values ('00000000-0000-0000-0000-00000000a001', true) $$,
  '42501', null, 'users cannot write outbound clicks directly');

reset role;

-- B's rows were untouched by A --------------------------------------------

select results_eq($$
  select stage::text, user_id from public.tracker_cards
  where id = '00000000-0000-0000-0000-00000000cb01'
$$, $$ values ('saved', '00000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'A could not move or delete B''s card');

select is((select status::text from public.inbound_emails
           where id = '00000000-0000-0000-0000-00000000eb01'),
  'needs_review', 'A could not resolve B''s inbound email');

select is((select count(*)::int from public.outbound_clicks where user_id is null), 1,
  'the anonymous click was logged without a user');

select * from finish();
rollback;
