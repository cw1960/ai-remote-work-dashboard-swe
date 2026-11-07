-- Job alerts: matching, due searches, marking, limits and the schedule.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com');

-- Two new law jobs (one in Spanish, $50/hr), one old, one closed, one other field.
insert into public.jobs
  (id, platform_id, external_id, title, url, domain, languages, pay_min, pay_max, pay_unit,
   countries, countries_blocked, first_seen_at, status, closed_at)
select v.id::uuid, p.id, v.ext, v.title, 'https://example.com/' || v.ext, v.domain,
       v.languages, v.pay_min, v.pay_max, v.pay_unit::public.pay_unit, v.countries, v.blocked,
       v.seen::timestamptz, v.status::public.job_status, v.closed::timestamptz
from public.platforms p,
  (values
    ('00000000-0000-0000-0000-00000000a001', 'alert-1', 'Spanish Contract_Lawyer', 'law', '{es}'::text[], 40, 50, 'hour', '{}'::text[], '{}'::text[], '2026-10-05T10:00:00Z', 'open', null),
    ('00000000-0000-0000-0000-00000000a002', 'alert-2', 'Litigation Reviewer', 'law', '{en}', 20, 30, 'hour', '{US}', '{}', '2026-10-05T09:00:00Z', 'open', null),
    ('00000000-0000-0000-0000-00000000a003', 'alert-3', 'Old Law Job', 'law', '{en}', 20, 30, 'hour', '{}', '{}', '2026-09-01T00:00:00Z', 'open', null),
    ('00000000-0000-0000-0000-00000000a004', 'alert-4', 'Closed Law Job', 'law', '{en}', 20, 30, 'hour', '{}', '{}', '2026-10-05T08:00:00Z', 'closed', '2026-10-05T09:00:00Z'),
    ('00000000-0000-0000-0000-00000000a005', 'alert-5', 'Physics Tutor', 'science', '{en}', 20, 30, 'hour', '{}', '{MX}', '2026-10-05T08:00:00Z', 'open', null)
  ) as v(id, ext, title, domain, languages, pay_min, pay_max, pay_unit, countries, blocked, seen, status, closed)
where p.slug = 'mercor';

insert into public.saved_searches (id, user_id, filters, frequency, created_at, last_sent_at)
values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000a1',
   '{"domains": ["law"]}', 'daily', '2026-10-01T00:00:00Z', '2026-10-04T14:00:00Z'),
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000a1',
   '{"languages": ["es"], "minPay": 45}', 'weekly', '2026-10-01T00:00:00Z', '2026-10-01T14:00:00Z'),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000000b1',
   '{"q": "tutor", "country": "MX"}', 'daily', '2026-10-01T00:00:00Z', null),
  ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000000b1',
   '{"q": "_lawyer", "platforms": ["mercor"]}', 'daily', '2026-10-01T00:00:00Z', null);

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'cron_token';
grant select on t to anon, authenticated;

-- Schedule ------------------------------------------------------------------

select results_eq(
  $$ select schedule from cron.job where jobname = 'email-job-alerts' $$,
  $$ values ('0 14 * * *'::text) $$,
  'alerts run daily at 14:00 UTC'
);
select public.set_app_url('https://example.com');
select isnt(private.invoke_job_alerts(), null, 'a configured run is queued');
select is(
  (select url from net.http_request_queue order by id desc limit 1),
  'https://example.com/api/cron/alerts',
  'it calls the alerts route'
);

-- Due alerts ----------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select * from public.due_job_alerts('wrong', now()) $$,
  '28000', null, 'a wrong token is refused'
);

select results_eq(
  $$ select search_id, total from public.due_job_alerts((select token from t), '2026-10-05T14:00:00Z')
     where email in ('a@example.com', 'b@example.com')
     order by search_id $$,
  $$ values ('00000000-0000-0000-0000-0000000005a1'::uuid, 2),
            ('00000000-0000-0000-0000-0000000005b1'::uuid, 0),
            ('00000000-0000-0000-0000-0000000005b2'::uuid, 1) $$,
  'due searches with their new, open matches (weekly one not due yet)'
);
select is(
  (select jobs -> 0 ->> 'title' from public.due_job_alerts((select token from t), '2026-10-05T14:00:00Z')
   where search_id = '00000000-0000-0000-0000-0000000005a1'),
  'Spanish Contract_Lawyer',
  'newest match first'
);
select is(
  (select platform_names from public.due_job_alerts((select token from t), '2026-10-05T14:00:00Z')
   where search_id = '00000000-0000-0000-0000-0000000005b2'),
  array['Mercor'],
  'platform names come along for the description'
);
select is(
  (select total from public.due_job_alerts((select token from t), '2026-10-12T14:00:00Z')
   where search_id = '00000000-0000-0000-0000-0000000005a2'),
  1,
  'weekly: language and minimum hourly pay both apply'
);
select is(
  (select count(*)::int from public.due_job_alerts((select token from t), '2026-10-05T14:00:00Z')
   where email = 'b@example.com' and total > 0),
  1,
  'a blocked country excludes a job; the title search matches "_" literally'
);

select throws_ok(
  $$ select public.mark_job_alerts_sent('wrong', array['00000000-0000-0000-0000-0000000005a1'::uuid], now()) $$,
  '28000', null, 'marking needs the token'
);
select public.mark_job_alerts_sent(
  (select token from t),
  array['00000000-0000-0000-0000-0000000005a1'::uuid],
  '2026-10-05T14:00:00Z'
);
select is_empty(
  $$ select 1 from public.due_job_alerts((select token from t), '2026-10-05T14:05:00Z')
     where search_id = '00000000-0000-0000-0000-0000000005a1' $$,
  'a sent search is not due again the same day'
);
select is(
  (select total from public.due_job_alerts((select token from t), '2026-10-06T13:55:00Z')
   where search_id = '00000000-0000-0000-0000-0000000005a1'),
  0,
  'next day it is due again, with only what is new since'
);

reset role;
update public.email_prefs set alerts_on = false
where user_id = '00000000-0000-0000-0000-0000000000b1';
set local role anon;
select is_empty(
  $$ select 1 from public.due_job_alerts((select token from t), '2026-10-05T14:00:00Z')
     where email = 'b@example.com' $$,
  'no alerts once they are off'
);

-- Owners and limits -----------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.saved_searches (filters) values ('{"domains": ["law"]}') $$,
  '23505', null, 'the same search cannot be saved twice'
);
select lives_ok(
  $$ insert into public.saved_searches (filters)
     select jsonb_build_object('q', 'term ' || n) from generate_series(1, 8) n $$,
  'up to 10 searches can be saved'
);
select throws_ok(
  $$ insert into public.saved_searches (filters) values ('{"q": "eleventh"}') $$,
  'P0010', null, 'the eleventh is refused'
);
select throws_ok(
  $$ update public.saved_searches set last_sent_at = null $$,
  '42501', null, 'users cannot reset when an alert was sent'
);

select * from finish();
rollback;
