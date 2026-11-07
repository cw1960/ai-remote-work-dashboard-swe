-- Weekly recap: who is due, the week's numbers, top matches, marking.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'recap-a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'recap-b@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'recap-c@example.com');

-- A: a law profile, a card applied and then interviewing last week.
update public.profiles set domains = '{law}'
where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.tracker_cards (id, user_id, kind, title, stage)
values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000a1',
        'manual', 'Acme', 'saved');
update public.tracker_cards set stage = 'applied'
where id = '00000000-0000-0000-0000-00000000ca01';
update public.tracker_cards set stage = 'interviewing'
where id = '00000000-0000-0000-0000-00000000ca01';
update public.card_events set at = '2026-10-08T10:00:00Z'
where card_id = '00000000-0000-0000-0000-00000000ca01';
-- B: recaps off. C: nothing on the board and nothing matching.
update public.email_prefs set recap_on = false
where user_id = '00000000-0000-0000-0000-0000000000b1';
insert into public.tracker_cards (user_id, kind, title)
values ('00000000-0000-0000-0000-0000000000b1', 'manual', 'B card');

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'cron_token';
grant select on t to anon;

select results_eq(
  $$ select schedule from cron.job where jobname = 'email-weekly-recap' $$,
  $$ values ('0 15 * * 1'::text) $$,
  'recaps go out on Mondays at 15:00 UTC'
);
select public.set_app_url('https://example.com');
select isnt(private.invoke_recaps(), null, 'a configured run is queued');
select is(
  (select url from net.http_request_queue order by id desc limit 1),
  'https://example.com/api/cron/recap',
  'it calls the recap route'
);

set local role anon;

select throws_ok(
  $$ select * from public.due_recaps('wrong', '2026-10-12') $$,
  '28000', null, 'a wrong token is refused'
);
select results_eq(
  $$ select email, applied, responses, moves from public.due_recaps((select token from t), '2026-10-12')
     where email like 'recap-%' $$,
  $$ values ('recap-a@example.com'::text, 1, 1, 2) $$,
  'only users with recaps on and something to report; the week''s numbers'
);
select ok(
  (select jsonb_array_length(matches) between 1 and 5
     and matches -> 0 ->> 'title' is not null
   from public.due_recaps((select token from t), '2026-10-12')
   where email = 'recap-a@example.com'),
  'up to five matches with their titles'
);
select is(
  (select applied from public.due_recaps((select token from t), '2026-10-19')
   where email = 'recap-a@example.com'),
  0, 'last week''s moves are not counted again'
);

select throws_ok(
  $$ select public.mark_recap_sent('wrong', '00000000-0000-0000-0000-0000000000a1', '2026-10-12') $$,
  '28000', null, 'marking needs the token'
);
select public.mark_recap_sent((select token from t), '00000000-0000-0000-0000-0000000000a1', '2026-10-12');
select is_empty(
  $$ select 1 from public.due_recaps((select token from t), '2026-10-12')
     where email = 'recap-a@example.com' $$,
  'a sent recap is not due again that week'
);
select isnt_empty(
  $$ select 1 from public.due_recaps((select token from t), '2026-10-19')
     where email = 'recap-a@example.com' $$,
  'it is due again the next Monday'
);

reset role;
set local role authenticated;
select throws_ok(
  $$ select * from public.due_recaps('x', '2026-10-12') $$,
  '42501', null, 'signed-in users cannot call it'
);

select * from finish();
rollback;
