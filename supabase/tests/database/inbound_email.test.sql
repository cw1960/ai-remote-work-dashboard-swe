-- Email auto-capture: senders, confident matches, needs review, resolving.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Ana@Example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'bo@example.com');

create temporary table tok (user_id uuid, token text) on commit drop;
insert into tok select user_id, inbound_token from public.email_prefs
where user_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');
grant select on tok to authenticated;

create function pg_temp.token(p uuid) returns text language sql as
  $$ select token from tok where user_id = p $$;

-- Who may call it ------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.record_inbound_email(text, text, text, text, public.card_stage)', 'execute'), 'anon cannot record');
select ok(not has_function_privilege('authenticated', 'public.record_inbound_email(text, text, text, text, public.card_stage)', 'execute'), 'users cannot record');
select ok(has_function_privilege('service_role', 'public.record_inbound_email(text, text, text, text, public.card_stage)', 'execute'), 'the Edge Function (service role) can');

-- Senders ------------------------------------------------------------------

select is(public.record_inbound_email('x', 'team@mercor.com', 's', 'mercor', 'applied'), 'unknown_token', 'an unknown address is dropped');
select is(public.record_inbound_email(pg_temp.token('00000000-0000-0000-0000-0000000000a1'), 'spam@evil.com', 's', 'mercor', 'applied'),
  'unknown_sender', 'mail from strangers is dropped');
select is((select count(*)::int from public.inbound_emails where user_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'and nothing is stored');

-- Confident: no card yet → a platform card ----------------------------------

select is(public.record_inbound_email(pg_temp.token('00000000-0000-0000-0000-0000000000a1'), 'ana@example.com', 'Thank you for applying', 'micro1', 'applied'),
  'applied', 'a forwarded micro1 confirmation is applied');
select results_eq(
  $$ select c.kind::text, c.stage::text, c.title from public.tracker_cards c
     where c.user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('platform', 'applied', 'micro1') $$,
  'as a new micro1 card in Applied'
);
select results_eq(
  $$ select from_domain, status::text from public.inbound_emails
     where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('micro1.ai', 'applied') $$,
  'stored with the platform''s domain, not the user''s'
);

-- Confident: one card → it moves, forward only --------------------------------

select is(public.record_inbound_email(pg_temp.token('00000000-0000-0000-0000-0000000000a1'), 'zara@micro1.io', 'Complete your AI interview', 'micro1', 'assessment'),
  'applied', 'an auto-forwarded micro1 email moves the card');
select is((select stage::text from public.tracker_cards where user_id = '00000000-0000-0000-0000-0000000000a1'), 'assessment', 'to Assessment');
select is(
  (select source::text from public.card_events e join public.tracker_cards c on c.id = e.card_id
   where c.user_id = '00000000-0000-0000-0000-0000000000a1' order by e.at desc, e.id desc limit 1),
  'email', 'the move is recorded as from email'
);
select public.record_inbound_email(pg_temp.token('00000000-0000-0000-0000-0000000000a1'), 'ana@example.com', 'Thank you for applying', 'micro1', 'applied');
select is((select stage::text from public.tracker_cards where user_id = '00000000-0000-0000-0000-0000000000a1'), 'assessment', 'a late confirmation does not move it back');

-- Unsure → needs review, then resolved by the user ----------------------------

select is(public.record_inbound_email(pg_temp.token('00000000-0000-0000-0000-0000000000a1'), 'team@mercor.com', 'Quick question', 'mercor', null),
  'needs_review', 'no stage: needs review');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$ select public.resolve_inbound_email(
       (select id from public.inbound_emails limit 1), 'applied') $$,
  'P0002', null, 'other users cannot resolve it (or even see it)'
);

set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select public.resolve_inbound_email(
  (select id from public.inbound_emails where status = 'needs_review'), 'applied'
);
select results_eq(
  $$ select c.title, c.stage::text from public.tracker_cards c where c.kind = 'platform' order by c.title $$,
  $$ values ('Mercor', 'applied'), ('micro1', 'assessment') $$,
  'resolving without a card creates one for the matched platform'
);

select * from finish();
rollback;
