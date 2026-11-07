-- Newsletter workflow: token-gated, closed tables, and The Numbers add up.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

-- Fixtures (as postgres) ---------------------------------------------------
-- Jobs in January 2020, away from the seeded sample jobs. The period under
-- test is 8–15 January; 1–8 January is the period before it.

create temporary table ids (ext text, id uuid) on commit drop;

-- xAI stands in for a newsletter-only source.
update public.platforms set listed = false, newsletter_only = true where slug = 'xai';

-- Both sources have been running since December, so every January job is
-- new and both weeks compare like with like.
insert into public.ingest_runs (platform_id, started_at, finished_at, found)
select id, '2019-12-01', '2019-12-01', 1 from public.platforms
where slug in ('mercor', 'xai');

with new_jobs as (
  insert into public.jobs (platform_id, external_id, title, domain, pay_min,
    pay_max, pay_unit, url, first_seen_at, last_seen_at, status, closed_at)
  select p.id, v.ext, v.title, v.domain, v.pay_min, v.pay_max,
    v.pay_unit::public.pay_unit, 'https://example.com/' || v.ext, v.seen, v.seen,
    v.status::public.job_status,
    case when v.status = 'closed' then v.seen + interval '1 day' end
  from (values
    ('mercor', 'nw-1', 'Contract Lawyer', 'law', 40, 60, 'hour', '2020-01-09'::timestamptz, 'open'),
    ('mercor', 'nw-2', 'Patent Attorney', 'law', 90, null, 'hour', '2020-01-10', 'open'),
    ('xai', 'nw-3', 'Legal Tutor', 'law', 50, 120, 'hour', '2020-01-11', 'open'),
    ('xai', 'nw-4', 'Math Tutor', 'math', null, null, null, '2020-01-12', 'open'),
    ('mercor', 'nw-5', 'Proof Writer', 'math', 500, null, 'task', '2020-01-12', 'open'),
    ('mercor', 'nw-6', 'Doctor', 'medicine', null, null, null, '2020-01-13', 'open'),
    ('xai', 'nw-7', 'Closed Role', null, null, null, null, '2020-01-13', 'closed'),
    ('mercor', 'np-1', 'Old Math 1', 'math', null, null, null, '2020-01-02', 'open'),
    ('mercor', 'np-2', 'Old Math 2', 'math', null, null, null, '2020-01-03', 'open'),
    ('mercor', 'np-3', 'Old Math 3', 'math', null, null, null, '2020-01-04', 'open'),
    ('mercor', 'np-4', 'Old Law', 'law', null, null, null, '2020-01-05', 'open')
  ) as v(slug, ext, title, domain, pay_min, pay_max, pay_unit, seen, status)
  join public.platforms p on p.slug = v.slug
  returning external_id, id
)
insert into ids select external_id, id from new_jobs;

-- A hand-picked listing still waiting on a duplicate decision: never counted.
insert into public.jobs (platform_id, external_id, title, domain, url,
  first_seen_at, last_seen_at, source, review_of)
select p.id, 'nw-review', 'Contract Lawyer (again)', 'law',
  'https://example.com/nw-review', '2020-01-09', '2020-01-09', 'manual',
  (select id from ids where ext = 'nw-1')
from public.platforms p where p.slug = 'mercor';
insert into ids select external_id, id from public.jobs where external_id = 'nw-review';

grant select on ids to anon;

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to anon;

-- Filled in as anon below.
create temporary table n (v jsonb) on commit drop;
create temporary table r (id uuid) on commit drop;
grant select, insert on n, r to anon;

select ok((select token ~ '^[0-9a-f]{64}$' from t), 'the newsletter token is in Vault');

-- Who may call what ----------------------------------------------------------

select ok(has_function_privilege('anon', 'public.newsletter_numbers(text, timestamptz, timestamptz)', 'execute'),
  'anon (the workflow, with the token) may ask for The Numbers');
select ok(not has_function_privilege('authenticated', 'public.newsletter_numbers(text, timestamptz, timestamptz)', 'execute'),
  'signed-in users may not');
select ok(not has_function_privilege('authenticated', 'public.newsletter_candidates(text, timestamptz)', 'execute'),
  'signed-in users may not list candidates');
select ok(not has_function_privilege('authenticated', 'public.newsletter_save_drafts(text, uuid, jsonb)', 'execute'),
  'signed-in users may not save drafts');

set local role anon;

select throws_ok(
  $$ select public.newsletter_numbers('wrong', '2020-01-08', '2020-01-15') $$,
  '28000', null, 'a wrong token is refused'
);
select throws_ok(
  $$ select * from public.newsletter_candidates(null, '2020-01-08') $$,
  '28000', null, 'a missing token is refused'
);
select throws_ok(
  $$ select * from public.newsletter_runs $$,
  '42501', null, 'anon cannot read runs directly'
);
select throws_ok(
  $$ select * from public.social_drafts $$,
  '42501', null, 'anon cannot read drafts directly'
);

-- The Numbers ----------------------------------------------------------------

insert into n
select public.newsletter_numbers((select token from t), '2020-01-08', '2020-01-15') as v;

select is((select (v ->> 'new_jobs')::int from n), 7,
  'new jobs: first seen in the period, closed ones included, listings in review left out');
select is((select v -> 'by_platform' from n),
  '[{"platform": "Mercor", "jobs": 4}, {"platform": "xAI", "jobs": 3}]'::jsonb,
  'new jobs by platform');
select is((select v -> 'busiest_fields' from n),
  '[{"field": "law", "jobs": 3}, {"field": "math", "jobs": 2}, {"field": "medicine", "jobs": 1}]'::jsonb,
  'busiest fields');
select is((select v -> 'top_hourly' from n),
  jsonb_build_object('job_id', (select id from ids where ext = 'nw-3'), 'title', 'Legal Tutor',
    'platform', 'xAI', 'pay_min', 50.00, 'pay_max', 120.00),
  'top hourly rate: the highest advertised hourly figure; other units are left out');
select is((select v -> 'fastest_growing' from n),
  '{"field": "law", "jobs": 3, "previous": 1}'::jsonb,
  'fastest-growing field: up on the period before, with at least 3 new jobs');
select is(
  public.newsletter_numbers((select token from t), '2020-01-01', '2020-01-08') -> 'fastest_growing',
  '{"field": "math", "jobs": 3, "previous": 0}'::jsonb,
  'a field with no jobs the period before can be fastest-growing');
select throws_ok(
  $$ select public.newsletter_numbers((select token from t), '2020-01-01', '2020-03-01') $$,
  '22023', null, 'periods longer than 31 days are refused'
);

-- Candidates -----------------------------------------------------------------

select results_eq(
  $$ select c.title, c.platform, c.field, c.go_link
     from public.newsletter_candidates((select token from t), '2020-01-08') c
     join ids on ids.id = c.job_id
     order by c.first_seen_at, c.title $$,
  $$ values ('Contract Lawyer'::text, 'Mercor'::text, 'law'::text, true),
            ('Patent Attorney', 'Mercor', 'law', true),
            ('Legal Tutor', 'xAI', 'law', false),
            ('Math Tutor', 'xAI', 'math', false),
            ('Proof Writer', 'Mercor', 'math', true),
            ('Doctor', 'Mercor', 'medicine', true) $$,
  'candidates: open jobs since the date; site jobs link through /go, newsletter-only ones do not'
);

-- Runs, shortlists and drafts ---------------------------------------------------

insert into r select public.newsletter_start_run((select token from t), 'weekly', '2020-01-15');

select lives_ok(
  $$ select public.newsletter_save_shortlist((select token from t), (select id from r),
       jsonb_build_array(
         jsonb_build_object('job_id', (select id from ids where ext = 'nw-1'), 'rank', 1, 'reason', 'Well paid'),
         jsonb_build_object('job_id', (select id from ids where ext = 'nw-3'), 'rank', 2, 'reason', 'Open worldwide', 'caveats', ' ')
       )) $$,
  'the workflow saves a shortlist'
);
select lives_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from r),
       '[{"channel": "linkedin", "body": "First"}, {"channel": "x", "body": "Short"}]') $$,
  'the workflow saves drafts'
);
select lives_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from r),
       '[{"channel": "linkedin", "body": "Second"}]') $$,
  'saving again replaces the drafts'
);
select lives_ok(
  $$ select public.newsletter_finish_run((select token from t), (select id from r),
       'succeeded', 1200, 300, 2, 0.0425) $$,
  'the workflow finishes the run with its usage'
);
select throws_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from r),
       '[{"channel": "x", "body": "Late"}]') $$,
  '22023', null, 'a finished run takes no more drafts'
);

reset role;

select results_eq(
  $$ select rank::int, caveats from public.job_shortlists
     where run_id = (select id from r) order by rank $$,
  $$ values (1, null::text), (2, null::text) $$,
  'the shortlist is stored in rank order, blank caveats as none'
);
select results_eq(
  $$ select channel, body from public.social_drafts where run_id = (select id from r) $$,
  $$ values ('linkedin'::text, 'Second'::text) $$,
  'only the latest drafts are kept'
);

-- Growth compares like with like --------------------------------------------
-- If Mercor's first run had been on 5 January, the week before 8 January
-- isn't comparable for Mercor, and xAI alone has no field with 3 new jobs.

update public.ingest_runs set started_at = '2020-01-05', finished_at = '2020-01-05'
where platform_id = (select id from public.platforms where slug = 'mercor');

select is(
  public.newsletter_numbers((select token from t), '2020-01-08', '2020-01-15') -> 'fastest_growing',
  'null'::jsonb,
  'a source that started during the earlier period is left out of growth');

-- A source's first import is its backlog, not new jobs -----------------------
-- xAI's first successful run starts on 12 January: its jobs first seen then
-- or before (nw-3, nw-4) are its backlog. Later ones count.

delete from public.ingest_runs
where platform_id = (select id from public.platforms where slug = 'xai');
insert into public.ingest_runs (platform_id, started_at, finished_at, found)
select id, '2020-01-12', '2020-01-12', 3 from public.platforms where slug = 'xai';
insert into public.jobs (platform_id, external_id, title, domain, url,
  first_seen_at, last_seen_at)
select id, 'nw-8', 'Generalist', 'other', 'https://example.com/nw-8',
  '2020-01-13', '2020-01-13'
from public.platforms where slug = 'mercor';

delete from n;
insert into n
select public.newsletter_numbers((select token from t), '2020-01-08', '2020-01-15');

select is((select (v ->> 'new_jobs')::int from n), 6,
  'new jobs leave out a source''s first import');
select is((select v -> 'by_platform' from n),
  '[{"platform": "Mercor", "jobs": 5}, {"platform": "xAI", "jobs": 1}]'::jsonb,
  'by platform, without the backlog');
select is((select v -> 'busiest_fields' from n),
  '[{"field": "law", "jobs": 2}, {"field": "math", "jobs": 1}, {"field": "medicine", "jobs": 1}]'::jsonb,
  'busiest fields leave out the catch-all "other"');
select is((select v -> 'top_hourly' ->> 'title' from n), 'Patent Attorney',
  'the top hourly rate comes from new jobs only');

select * from finish();
rollback;
