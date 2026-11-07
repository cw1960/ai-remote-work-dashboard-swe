-- Email: welcome claim, due reminders, unsubscribe tokens and the schedule.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com');

update public.profiles set locale = 'es'
where user_id = '00000000-0000-0000-0000-0000000000b1';

insert into public.tracker_cards (user_id, kind, title, stage, next_action_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'manual', 'A due', 'applied', '2026-10-05T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'manual', 'A also due', 'saved', '2026-10-05T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'manual', 'A later', 'saved', '2026-10-06T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b1', 'manual', 'B due', 'saved', '2026-10-05T00:00:00Z');

create temporary table t (token text, unsub_a text) on commit drop;
insert into t
select
  (select decrypted_secret from vault.decrypted_secrets where name = 'cron_token'),
  (select unsubscribe_token from public.email_prefs
   where user_id = '00000000-0000-0000-0000-0000000000a1');
grant select on t to anon, authenticated;

-- Schedule and URL ---------------------------------------------------------

select results_eq(
  $$ select schedule from cron.job where jobname = 'email-reminders' $$,
  $$ values ('0 13 * * *'::text) $$,
  'reminders run daily at 13:00 UTC'
);
select ok(
  (select token ~ '^[0-9a-f]{64}$' from t),
  'a random 256-bit cron token is stored in Vault'
);

delete from vault.secrets where name = 'app_url';
select is(private.invoke_reminders(), null, 'runs are skipped until the app URL is set');
select throws_ok(
  $$ select public.set_app_url('https://example.com/api') $$,
  'P0001', null, 'the app URL must be a base URL'
);
select public.set_app_url('https://example.com');
select isnt(private.invoke_reminders(), null, 'a configured run is queued');
select is(
  (select url from net.http_request_queue order by id desc limit 1),
  'https://example.com/api/cron/reminders',
  'it calls the reminders route'
);
select is(
  (select headers ->> 'x-cron-token' from net.http_request_queue order by id desc limit 1),
  (select token from t),
  'it sends the cron token'
);

-- Due reminders -------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select * from public.due_reminders('wrong', '2026-10-05') $$,
  '28000', null, 'a wrong token is refused'
);
select throws_ok(
  $$ select public.mark_reminder_sent('wrong', '00000000-0000-0000-0000-0000000000a1', '2026-10-05') $$,
  '28000', null, 'marking needs the token too'
);

select results_eq(
  $$ select email, locale, jsonb_array_length(cards)
     from public.due_reminders((select token from t), '2026-10-05') order by email $$,
  $$ values ('a@example.com'::text, 'en'::text, 2), ('b@example.com', 'es', 1) $$,
  'one row per user with cards due that day, in their locale'
);
select is(
  (select cards -> 0 ->> 'title' from public.due_reminders((select token from t), '2026-10-05')
   where email = 'a@example.com'),
  'A also due',
  'cards are ordered by stage'
);

select public.mark_reminder_sent(
  (select token from t), '00000000-0000-0000-0000-0000000000a1', '2026-10-05'
);
select results_eq(
  $$ select email from public.due_reminders((select token from t), '2026-10-05') $$,
  $$ values ('b@example.com'::text) $$,
  'a user is reminded once per day'
);
select results_eq(
  $$ select email from public.due_reminders((select token from t), '2026-10-06') $$,
  $$ values ('a@example.com'::text) $$,
  'and again on the next due day'
);

-- Unsubscribe by token ------------------------------------------------------

select results_eq(
  $$ select alerts_on, reminders_on, recap_on
     from public.email_prefs_by_token((select unsub_a from t)) $$,
  $$ values (true, true, true) $$,
  'anon reads prefs with the unsubscribe token'
);
select is_empty(
  $$ select * from public.email_prefs_by_token('0123456789abcdef0123456789abcdef') $$,
  'an unknown token reads nothing'
);
select ok(
  public.set_email_prefs_by_token((select unsub_a from t), p_reminders_on => false),
  'anon turns reminders off with the token'
);
select ok(
  not public.set_email_prefs_by_token('not a token', false, false, false),
  'a malformed token changes nothing'
);
select results_eq(
  $$ select alerts_on, reminders_on, recap_on
     from public.email_prefs_by_token((select unsub_a from t)) $$,
  $$ values (true, false, true) $$,
  'only the named preference changed'
);
select results_eq(
  $$ select email from public.due_reminders((select token from t), '2026-10-06') $$,
  $$ select null::text where false $$,
  'no reminders once they are off'
);

select throws_ok(
  $$ select * from public.claim_welcome_email() $$,
  '42501', null, 'anon cannot claim a welcome email'
);

-- Welcome email -------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

select results_eq(
  $$ select email, locale from public.claim_welcome_email() $$,
  $$ values ('b@example.com'::text, 'es'::text) $$,
  'the first claim returns where to send the welcome email'
);
select is_empty(
  $$ select * from public.claim_welcome_email() $$,
  'a second claim returns nothing'
);

select throws_ok(
  $$ update public.email_prefs set welcomed_at = null, last_reminder_on = null
     where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', null, 'users cannot reset the welcome or reminder markers'
);
select throws_ok(
  $$ select public.set_app_url('https://evil.example') $$,
  '42501', null, 'users cannot change the app URL'
);

select * from finish();
rollback;
