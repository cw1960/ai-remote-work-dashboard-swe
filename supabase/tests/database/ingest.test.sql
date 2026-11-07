-- ingest_jobs(): upsert, run logging, and the "missing from two successful
-- runs" closing rule.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

create temp table t_jobs (label text primary key, payload jsonb);
insert into t_jobs values
  ('a', '{"external_id":"a","title":"Job A","url":"https://example.com/a","pay_min":40,"pay_max":60,"pay_unit":"hour","languages":["es"],"countries":["MX"],"tags":["remote"]}'),
  ('b', '{"external_id":"b","title":"Job B","url":"https://example.com/b"}'),
  ('c', '{"external_id":"c","title":"Job C","url":"https://example.com/c","countries_blocked":["IN"]}');

create function pg_temp.batch(variadic labels text[]) returns jsonb
language sql as $$
  select coalesce(jsonb_agg(payload order by label), '[]') from t_jobs where label = any(labels)
$$;

create function pg_temp.job(ext text) returns public.jobs
language sql as $$
  select j.* from public.jobs j
  join public.platforms p on p.id = j.platform_id
  where p.slug = 'micro1' and j.external_id = ext
$$;

-- Run 1: first sight of A, B, C ----------------------------------------

select is(
  public.ingest_jobs('micro1', now() - interval '5 days', pg_temp.batch('a', 'b', 'c'), 2)
    - 'run_id',
  '{"found":3,"inserted":3,"updated":0,"closed":0,"skipped":2,"error":null}'::jsonb,
  'first run inserts every job'
);

select is((pg_temp.job('a')).pay_unit::text, 'hour', 'fields are mapped (pay unit)');
select is((pg_temp.job('a')).countries, '{MX}'::text[], 'fields are mapped (countries)');
select is((pg_temp.job('c')).countries_blocked, '{IN}'::text[], 'fields are mapped (blocked countries)');
select is((pg_temp.job('b')).tags, '{}'::text[], 'missing arrays default to empty');
select is((pg_temp.job('a')).last_seen_at, (pg_temp.job('a')).first_seen_at,
  'first and last seen are the run time');

-- Run 2: C is missing once -> still open --------------------------------

update t_jobs set payload = payload || '{"title":"Job A (edited)"}' where label = 'a';

select is(
  public.ingest_jobs('micro1', now() - interval '4 days', pg_temp.batch('a', 'b')) - 'run_id',
  '{"found":2,"inserted":0,"updated":2,"closed":0,"skipped":0,"error":null}'::jsonb,
  'second run updates the jobs it sees'
);
select is((pg_temp.job('a')).title, 'Job A (edited)', 'changed fields are updated');
select is((pg_temp.job('c')).status::text, 'open', 'a job missing from one run stays open');

-- A failed run and a zero-job run in between change nothing -------------

select is(
  public.ingest_jobs('micro1', now() - interval '3 days', '[]', 0, 'HTTP 503') ->> 'error',
  'HTTP 503',
  'a failed run is logged with its error'
);
select is(
  public.ingest_jobs('micro1', now() - interval '2 days', '[]') ->> 'error',
  'source returned zero jobs',
  'a run with zero jobs is logged as an error'
);
select is(
  (select count(*)::int from public.jobs j join public.platforms p on p.id = j.platform_id
   where p.slug = 'micro1' and j.status = 'closed'
     and j.external_id in ('a', 'b', 'c')),
  0,
  'failed and empty runs close nothing'
);

-- Run 3 (successful): C missing twice in a row -> closed ----------------

select is(
  (public.ingest_jobs('micro1', now() - interval '1 day', pg_temp.batch('a', 'b')) ->> 'closed')::int,
  1,
  'a job missing from two successful runs is closed'
);
select is((pg_temp.job('c')).status::text, 'closed', 'C is closed');
select ok((pg_temp.job('c')).closed_at is not null, 'C has a closed date');
select is((pg_temp.job('a')).status::text, 'open', 'jobs still listed stay open');

-- Run 4: C comes back -> reopened -----------------------------------------

select public.ingest_jobs('micro1', now() - interval '1 hour', pg_temp.batch('a', 'b', 'c'));
select is((pg_temp.job('c')).status::text, 'open', 'a job that reappears is reopened');

select is(
  (select count(*)::int from public.ingest_runs r join public.platforms p on p.id = r.platform_id
   where p.slug = 'micro1'),
  6,
  'every run is logged'
);

-- Access -----------------------------------------------------------------

select throws_ok(
  $$ select public.ingest_jobs('nope', now(), '[]') $$,
  'P0002', null, 'unknown platforms are rejected'
);

set local role authenticated;
select throws_ok(
  $$ select public.ingest_jobs('micro1', now(), '[]') $$,
  '42501', null, 'signed-in users cannot run ingestion'
);
reset role;

select * from finish();
rollback;
