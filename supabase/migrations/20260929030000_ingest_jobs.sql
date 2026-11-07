-- Ingestion: store one adapter run in a single transaction.
--
-- The `ingest` Edge Function fetches a platform, maps listings to the jobs
-- shape, then calls ingest_jobs() with the service role. All the rules live
-- here so they are tested in SQL:
--   * upsert on (platform_id, external_id); last_seen_at = the run's start
--   * a job that reappears is reopened
--   * a run with an error, or with zero jobs, is logged and closes nothing
--   * an open job is closed once it has been missing from two successful
--     runs in a row (this one and the previous successful one)

-- Countries a job explicitly excludes (e.g. "not open to residents of …").
alter table public.jobs
  add column countries_blocked text[] not null default '{}'
    check (array_position(countries_blocked, null) is null
           and array_to_string(countries_blocked, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$');

-- Listings the adapter could not map (failed validation) in a run.
alter table public.ingest_runs
  add column skipped integer not null default 0 check (skipped >= 0);

create function public.ingest_jobs(
  p_platform text,
  p_started_at timestamptz,
  p_jobs jsonb,
  p_skipped integer default 0,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform_id uuid;
  v_run_id bigint;
  v_found integer := coalesce(jsonb_array_length(p_jobs), 0);
  v_error text := p_error;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_closed integer := 0;
  v_previous timestamptz;
begin
  select id into v_platform_id from public.platforms where slug = p_platform;
  if not found then
    raise exception 'unknown platform %', p_platform using errcode = 'P0002';
  end if;

  if p_started_at is null or p_started_at > now() then
    raise exception 'p_started_at must be a time in the past';
  end if;

  if v_error is null and v_found = 0 then
    v_error := 'source returned zero jobs';
  end if;

  insert into public.ingest_runs (platform_id, started_at, finished_at, found, skipped, error)
  values (v_platform_id, p_started_at, now(), v_found, coalesce(p_skipped, 0), v_error)
  returning id into v_run_id;

  if v_error is not null then
    return jsonb_build_object(
      'run_id', v_run_id, 'found', v_found, 'inserted', 0, 'updated', 0,
      'closed', 0, 'skipped', coalesce(p_skipped, 0), 'error', v_error
    );
  end if;

  with src as (
    select distinct on (x.external_id) x.*
    from jsonb_to_recordset(p_jobs) as x(
      external_id text, title text, summary text, domain text, tags text[],
      pay_min numeric, pay_max numeric, pay_unit public.pay_unit,
      languages text[], countries text[], countries_blocked text[],
      url text, posted_at timestamptz
    )
    order by x.external_id
  ),
  upserted as (
    insert into public.jobs as j (
      platform_id, external_id, title, summary, domain, tags, pay_min, pay_max,
      pay_unit, languages, countries, countries_blocked, url, posted_at,
      first_seen_at, last_seen_at, status, closed_at
    )
    select
      v_platform_id, s.external_id, s.title, s.summary, s.domain,
      coalesce(s.tags, '{}'), s.pay_min, s.pay_max, s.pay_unit,
      coalesce(s.languages, '{}'), coalesce(s.countries, '{}'),
      coalesce(s.countries_blocked, '{}'), s.url, s.posted_at,
      p_started_at, p_started_at, 'open', null
    from src s
    on conflict (platform_id, external_id) do update set
      title = excluded.title,
      summary = excluded.summary,
      domain = excluded.domain,
      tags = excluded.tags,
      pay_min = excluded.pay_min,
      pay_max = excluded.pay_max,
      pay_unit = excluded.pay_unit,
      languages = excluded.languages,
      countries = excluded.countries,
      countries_blocked = excluded.countries_blocked,
      url = excluded.url,
      posted_at = coalesce(excluded.posted_at, j.posted_at),
      last_seen_at = excluded.last_seen_at,
      status = 'open',
      closed_at = null
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new)
  into v_inserted, v_updated
  from upserted;

  -- The previous successful run. Jobs not seen since before it were missing
  -- from that run and from this one.
  select r.started_at into v_previous
  from public.ingest_runs r
  where r.platform_id = v_platform_id
    and r.error is null
    and r.id <> v_run_id
    and r.started_at < p_started_at
  order by r.started_at desc
  limit 1;

  if v_previous is not null then
    update public.jobs
    set status = 'closed', closed_at = p_started_at
    where platform_id = v_platform_id
      and status = 'open'
      and last_seen_at < v_previous;
    get diagnostics v_closed = row_count;
  end if;

  update public.ingest_runs
  set inserted = v_inserted, updated = v_updated, closed = v_closed, finished_at = now()
  where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id, 'found', v_found, 'inserted', v_inserted,
    'updated', v_updated, 'closed', v_closed,
    'skipped', coalesce(p_skipped, 0), 'error', null
  );
end;
$$;

revoke all on function public.ingest_jobs(text, timestamptz, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.ingest_jobs(text, timestamptz, jsonb, integer, text)
  to service_role;
