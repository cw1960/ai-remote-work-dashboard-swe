-- Newsletter N4: what the daily newsletter workflow reads and writes.
--
-- The workflow runs on GitHub Actions in cw1960/airemoteworktoday. It reaches
-- this database only through the functions below, each checking the
-- newsletter token kept in Vault (separate from the cron token, so either can
-- be revoked alone). It reads public job data only: nothing here touches
-- accounts, profiles, tracker cards or emails, and none of it is shown on the
-- site. The tables are admin-only: no API role can read or write them.

-- ---------------------------------------------------------------------------
-- Token
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'newsletter_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'newsletter_token',
      'Authenticates the newsletter workflow (cw1960/airemoteworktoday)'
    );
  end if;
end;
$$;

-- Raises unless p_token is the newsletter token. Internal only.
create function private.require_newsletter_token(p_token text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (select decrypted_secret = p_token
     from vault.decrypted_secrets
     where name = 'newsletter_token'),
    false
  ) then
    raise exception 'invalid newsletter token' using errcode = '28000';
  end if;
end;
$$;

revoke all on function private.require_newsletter_token(text) from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per workflow run, with what it cost.
create table public.newsletter_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('daily', 'weekly')),
  issue_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  web_searches integer not null default 0 check (web_searches >= 0),
  cost_usd numeric(10, 4) not null default 0 check (cost_usd >= 0),
  error text check (char_length(error) <= 1000),
  check ((status = 'running') = (finished_at is null))
);

comment on table public.newsletter_runs is
  'Newsletter workflow runs and their model usage and cost. Admin only.';

create index newsletter_runs_issue_idx
  on public.newsletter_runs (issue_date desc, started_at desc);

-- The Job Intelligence agent's picks for a run's issue.
create table public.job_shortlists (
  run_id uuid not null references public.newsletter_runs (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  rank smallint not null check (rank between 1 and 50),
  reason text not null check (char_length(reason) between 1 and 500),
  caveats text check (char_length(caveats) <= 500),
  primary key (run_id, job_id),
  unique (run_id, rank)
);

comment on table public.job_shortlists is
  'Jobs shortlisted for a newsletter issue, with reasons. Admin only.';

create index job_shortlists_job_idx on public.job_shortlists (job_id);

-- Social drafts (LinkedIn, X, Reddit, video script) from a run. Never posted
-- automatically: people copy them (docs/distribution.md in the newsletter repo).
create table public.social_drafts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.newsletter_runs (id) on delete cascade,
  channel text not null check (channel in ('linkedin', 'x', 'reddit', 'video')),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);

comment on table public.social_drafts is
  'Social post drafts from the newsletter workflow. Admin only.';

create index social_drafts_run_idx on public.social_drafts (run_id);

alter table public.newsletter_runs enable row level security;
alter table public.job_shortlists enable row level security;
alter table public.social_drafts enable row level security;

-- New tables get Supabase's default grants; the API roles get none here.
revoke all on public.newsletter_runs from anon, authenticated;
revoke all on public.job_shortlists from anon, authenticated;
revoke all on public.social_drafts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The Numbers: figures for [p_from, p_to), counted in SQL only.
-- ---------------------------------------------------------------------------

-- New jobs are jobs first seen in the period, whatever their status now.
-- Pay figures are as advertised. The fastest-growing field compares new jobs
-- with the period of the same length just before, and needs at least 3 new
-- jobs so a tiny count can't make a headline.
create function public.newsletter_numbers(
  p_token text,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prev_from timestamptz;
begin
  perform private.require_newsletter_token(p_token);
  if p_from is null or p_to is null or p_from >= p_to
     or p_to - p_from > interval '31 days' then
    raise exception 'period must be 1 second to 31 days' using errcode = '22023';
  end if;
  v_prev_from := p_from - (p_to - p_from);

  return (
    with fresh as (
      select j.*, p.name as platform
      from public.jobs j
      join public.platforms p on p.id = j.platform_id
      where j.first_seen_at >= p_from and j.first_seen_at < p_to
        and j.review_of is null
    ),
    previous as (
      select j.domain
      from public.jobs j
      where j.first_seen_at >= v_prev_from and j.first_seen_at < p_from
        and j.review_of is null
    ),
    growth as (
      select f.domain, count(*) as current,
        (select count(*) from previous pr where pr.domain = f.domain) as previous
      from fresh f
      where f.domain is not null
      group by f.domain
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'new_jobs', (select count(*) from fresh),
      'open_jobs', (
        select count(*) from public.jobs
        where status = 'open' and review_of is null
      ),
      'by_platform', coalesce((
        select jsonb_agg(jsonb_build_object('platform', platform, 'jobs', n)
                         order by n desc, platform)
        from (
          select platform, count(*) as n from fresh
          group by platform order by n desc, platform limit 5
        ) x
      ), '[]'::jsonb),
      'busiest_fields', coalesce((
        select jsonb_agg(jsonb_build_object('field', domain, 'jobs', n)
                         order by n desc, domain)
        from (
          select domain, count(*) as n from fresh
          where domain is not null
          group by domain order by n desc, domain limit 5
        ) x
      ), '[]'::jsonb),
      'top_hourly', (
        select jsonb_build_object(
          'job_id', id, 'title', title, 'platform', platform,
          'pay_min', pay_min, 'pay_max', pay_max
        )
        from fresh
        where pay_unit = 'hour' and coalesce(pay_max, pay_min) is not null
        order by coalesce(pay_max, pay_min) desc, first_seen_at, id
        limit 1
      ),
      'fastest_growing', (
        select jsonb_build_object(
          'field', domain, 'jobs', current, 'previous', previous
        )
        from growth
        where current >= 3 and current > previous
        order by current - previous desc, current desc, domain
        limit 1
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Candidates: open jobs first seen since p_since, public fields only.
-- ---------------------------------------------------------------------------

-- go_link: the job is on the site, so the issue links through /go/<job_id>
-- (referral and click count); otherwise it links to url directly. Hand-picked
-- listings still waiting on a duplicate decision are left out.
create function public.newsletter_candidates(p_token text, p_since timestamptz)
returns table (
  job_id uuid,
  platform text,
  title text,
  field text,
  summary text,
  tags text[],
  pay_min numeric,
  pay_max numeric,
  pay_unit public.pay_unit,
  languages text[],
  countries text[],
  countries_blocked text[],
  url text,
  go_link boolean,
  source text,
  verified_at timestamptz,
  posted_at timestamptz,
  first_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  if p_since is null then
    raise exception 'p_since is required' using errcode = '22023';
  end if;

  return query
  select j.id, p.name, j.title, j.domain, j.summary, j.tags, j.pay_min,
    j.pay_max, j.pay_unit, j.languages, j.countries, j.countries_blocked,
    j.url, not j.newsletter_only, j.source, j.verified_at, j.posted_at,
    j.first_seen_at
  from public.jobs j
  join public.platforms p on p.id = j.platform_id
  where j.status = 'open'
    and j.review_of is null
    and j.first_seen_at >= p_since
  order by j.first_seen_at desc, j.id
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------------
-- Runs, shortlists and drafts
-- ---------------------------------------------------------------------------

create function public.newsletter_start_run(
  p_token text,
  p_kind text,
  p_issue_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_newsletter_token(p_token);
  insert into public.newsletter_runs (kind, issue_date)
  values (p_kind, p_issue_date)
  returning id into v_id;
  return v_id;
end;
$$;

-- Raises unless the run exists and is still running. Internal only.
create function private.require_running_run(p_run_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.newsletter_runs
    where id = p_run_id and status = 'running'
  ) then
    raise exception 'no running newsletter run %', p_run_id using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_running_run(uuid) from public;

create function public.newsletter_finish_run(
  p_token text,
  p_run_id uuid,
  p_status text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_web_searches integer,
  p_cost_usd numeric,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  perform private.require_running_run(p_run_id);
  if p_status not in ('succeeded', 'failed') then
    raise exception 'status must be succeeded or failed' using errcode = '22023';
  end if;
  update public.newsletter_runs
  set status = p_status,
      finished_at = now(),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      web_searches = p_web_searches,
      cost_usd = p_cost_usd,
      error = left(p_error, 1000)
  where id = p_run_id;
end;
$$;

-- Replaces the run's shortlist: p_items is [{job_id, rank, reason, caveats}].
create function public.newsletter_save_shortlist(
  p_token text,
  p_run_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  perform private.require_running_run(p_run_id);
  delete from public.job_shortlists where run_id = p_run_id;
  insert into public.job_shortlists (run_id, job_id, rank, reason, caveats)
  select p_run_id, x.job_id, x.rank, x.reason, nullif(btrim(x.caveats), '')
  from jsonb_to_recordset(p_items)
    as x(job_id uuid, rank smallint, reason text, caveats text);
end;
$$;

-- Replaces the run's drafts: p_drafts is [{channel, body}].
create function public.newsletter_save_drafts(
  p_token text,
  p_run_id uuid,
  p_drafts jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  perform private.require_running_run(p_run_id);
  delete from public.social_drafts where run_id = p_run_id;
  insert into public.social_drafts (run_id, channel, body)
  select p_run_id, x.channel, x.body
  from jsonb_to_recordset(p_drafts) as x(channel text, body text);
end;
$$;

-- Token-gated, so the workflow calls them with the public (anon) key and no
-- service role key. Signed-in users get nothing (Supabase grants them new
-- functions by default, so they are revoked by name).
revoke all on function public.newsletter_numbers(text, timestamptz, timestamptz) from public, authenticated;
revoke all on function public.newsletter_candidates(text, timestamptz) from public, authenticated;
revoke all on function public.newsletter_start_run(text, text, date) from public, authenticated;
revoke all on function public.newsletter_finish_run(text, uuid, text, integer, integer, integer, numeric, text) from public, authenticated;
revoke all on function public.newsletter_save_shortlist(text, uuid, jsonb) from public, authenticated;
revoke all on function public.newsletter_save_drafts(text, uuid, jsonb) from public, authenticated;

grant execute on function public.newsletter_numbers(text, timestamptz, timestamptz) to anon, service_role;
grant execute on function public.newsletter_candidates(text, timestamptz) to anon, service_role;
grant execute on function public.newsletter_start_run(text, text, date) to anon, service_role;
grant execute on function public.newsletter_finish_run(text, uuid, text, integer, integer, integer, numeric, text) to anon, service_role;
grant execute on function public.newsletter_save_shortlist(text, uuid, jsonb) to anon, service_role;
grant execute on function public.newsletter_save_drafts(text, uuid, jsonb) to anon, service_role;
