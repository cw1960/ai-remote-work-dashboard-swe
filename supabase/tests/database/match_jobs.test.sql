-- match_jobs: scoring, eligibility, exclusions and access.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com');

update public.profiles
set domains = '{law}', languages = '{es}', country = 'MX', target_rate = 40
where user_id = '00000000-0000-0000-0000-0000000000a1';

insert into public.jobs
  (id, platform_id, external_id, title, url, domain, languages, pay_min, pay_max, pay_unit,
   countries, countries_blocked, posted_at, status, closed_at)
select v.id::uuid, p.id, v.ext, v.title, 'https://example.com/' || v.ext, v.domain,
       v.languages, v.pay_min, v.pay_max, v.pay_unit::public.pay_unit, v.countries, v.blocked,
       v.posted::timestamptz, v.status::public.job_status, v.closed::timestamptz
from public.platforms p,
  (values
    ('00000000-0000-0000-0000-00000000b001', 'm-1', 'Spanish Lawyer', 'law', '{es}'::text[], 40, 50, 'hour', '{}'::text[], '{}'::text[], now()::text, 'open', null),
    ('00000000-0000-0000-0000-00000000b002', 'm-2', 'US Only Lawyer', 'law', '{en}', 20, 60, 'hour', '{US}', '{}', now()::text, 'open', null),
    ('00000000-0000-0000-0000-00000000b003', 'm-3', 'Mexico Physics', 'science', '{es}', null, null, null, '{MX}', '{}', '2020-01-01', 'open', null),
    ('00000000-0000-0000-0000-00000000b004', 'm-4', 'Blocked Lawyer', 'law', '{es}', 40, 50, 'hour', '{}', '{MX}', now()::text, 'open', null),
    ('00000000-0000-0000-0000-00000000b005', 'm-5', 'Tracked Lawyer', 'law', '{es}', 40, 50, 'hour', '{}', '{}', now()::text, 'open', null),
    ('00000000-0000-0000-0000-00000000b006', 'm-6', 'Closed Lawyer', 'law', '{es}', 40, 50, 'hour', '{}', '{}', now()::text, 'closed', now()::text),
    ('00000000-0000-0000-0000-00000000b007', 'm-7', 'Cheap Lawyer', 'law', '{}', 10, 20, 'hour', '{}', '{}', '2020-01-01', 'open', null)
  ) as v(id, ext, title, domain, languages, pay_min, pay_max, pay_unit, countries, blocked, posted, status, closed)
where p.slug = 'mercor';

insert into public.tracker_cards (user_id, kind, job_id, title)
values ('00000000-0000-0000-0000-0000000000a1', 'job', '00000000-0000-0000-0000-00000000b005', 'Tracked Lawyer');

create temporary table ids (id uuid) on commit drop;
insert into ids values
  ('00000000-0000-0000-0000-00000000b001'), ('00000000-0000-0000-0000-00000000b002'),
  ('00000000-0000-0000-0000-00000000b003'), ('00000000-0000-0000-0000-00000000b004'),
  ('00000000-0000-0000-0000-00000000b005'), ('00000000-0000-0000-0000-00000000b006'),
  ('00000000-0000-0000-0000-00000000b007');
grant select on ids to anon, authenticated;

set local role anon;
select throws_ok(
  $$ select * from public.match_jobs('00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'signed-out visitors cannot match'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

create temporary table mine on commit drop as
  select * from public.match_jobs(
    '00000000-0000-0000-0000-0000000000a1', null, array(select id from ids)
  );

select results_eq(
  $$ select job_id, score from mine $$,
  $$ values ('00000000-0000-0000-0000-00000000b001'::uuid, 95),
            ('00000000-0000-0000-0000-00000000b003'::uuid, 35),
            ('00000000-0000-0000-0000-00000000b007'::uuid, 30) $$,
  'eligible, untracked, open jobs ranked by score'
);
select results_eq(
  $$ select matched_domain, matched_languages, pay_ok, country_ok from mine
     where job_id = '00000000-0000-0000-0000-00000000b001' $$,
  $$ values ('law'::text, '{es}'::text[], true, null::text) $$,
  'reasons for the best match'
);
select is(
  (select country_ok from mine where job_id = '00000000-0000-0000-0000-00000000b003'),
  'MX', 'a job limited to the user''s country says so'
);
select is(
  (select pay_ok from mine where job_id = '00000000-0000-0000-0000-00000000b007'),
  false, 'pay well below the target rate is not a reason'
);
select is_empty(
  $$ select 1 from mine where job_id in ('00000000-0000-0000-0000-00000000b002',
                                         '00000000-0000-0000-0000-00000000b004') $$,
  'jobs closed to the user''s country are hidden'
);
select is_empty(
  $$ select 1 from mine where job_id in ('00000000-0000-0000-0000-00000000b005',
                                         '00000000-0000-0000-0000-00000000b006') $$,
  'tracked and closed jobs are left out'
);
select is(
  (select count(*)::int from public.match_jobs('00000000-0000-0000-0000-0000000000a1', 1, array(select id from ids))),
  1, 'the limit applies'
);

set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is_empty(
  $$ select * from public.match_jobs('00000000-0000-0000-0000-0000000000a1') $$,
  'nobody can match another user''s profile'
);

select * from finish();
rollback;
