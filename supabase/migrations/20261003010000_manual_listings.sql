-- Hand-picked listings (newsletter N3). The editor adds listings by hand
-- from platforms we never fetch (their public pages), on an owner-only page
-- (/admin/listings). They are always newsletter-only, never closed by
-- ingestion, and closed by the editor.
--
-- Admins are listed by email in private.admins (not reachable through the
-- Data API). Every admin function checks private.is_admin(); the app holds
-- no service role key.

create table private.admins (
  email text primary key
    check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  added_at timestamptz not null default now()
);
revoke all on private.admins from public, anon, authenticated;

-- The owner (the editor of AI Remote Work Today).
insert into private.admins (email) values ('owner@example.com')
on conflict (email) do nothing;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid()
  )
$$;
revoke all on function private.is_admin() from public;

-- For the page: show it, or answer "not found".
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- jobs: where a job came from, and the editor's fields.
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column source text not null default 'feed'
    check (source in ('feed', 'manual')),
  -- When the editor last checked a hand-picked listing on its public page.
  add column verified_at timestamptz,
  -- A hand-picked listing that may repeat this job, until the editor decides.
  add column review_of uuid references public.jobs (id) on delete set null,
  add constraint jobs_manual_fields check (
    source = 'manual' or (verified_at is null and review_of is null)
  );

-- Hand-picked listings are always newsletter-only, whatever the platform.
create or replace function private.set_job_newsletter_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'manual' then
    new.newsletter_only := true;
    return new;
  end if;
  select p.newsletter_only into new.newsletter_only
  from public.platforms p
  where p.id = new.platform_id;
  return new;
end;
$$;

create or replace function private.sync_platform_newsletter_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
  set newsletter_only = new.newsletter_only
  where platform_id = new.id
    and source = 'feed'
    and newsletter_only is distinct from new.newsletter_only;
  return null;
end;
$$;

alter table public.jobs
  add constraint jobs_manual_newsletter_only check (source = 'feed' or newsletter_only);

create index jobs_manual_idx on public.jobs (created_at desc) where source = 'manual';

-- Ingestion never closes hand-picked listings (same function, one more
-- condition in the closing rule).
create or replace function public.ingest_jobs(
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
      and source = 'feed'
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

-- ---------------------------------------------------------------------------
-- Admin functions. Each refuses non-admins with 42501.
-- ---------------------------------------------------------------------------

create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_admin() from public;

-- Every platform, for the form's company list.
create function public.admin_platforms()
returns table (id uuid, slug text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select p.id, p.slug, p.name from public.platforms p order by p.name;
end;
$$;

-- Open jobs a new listing could repeat: the same platform's, or any with
-- the same address. The app classifies them (new / duplicate / updated /
-- uncertain).
create function public.admin_listing_candidates(p_platform_id uuid, p_url text)
returns table (
  id uuid,
  platform_id uuid,
  title text,
  url text,
  pay_min numeric,
  pay_max numeric,
  pay_unit public.pay_unit,
  countries text[],
  source text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select j.id, j.platform_id, j.title, j.url, j.pay_min, j.pay_max, j.pay_unit,
         j.countries, j.source
  from public.jobs j
  where j.status = 'open'
    and (j.platform_id = p_platform_id
         or lower(rtrim(j.url, '/')) = lower(rtrim(p_url, '/')));
end;
$$;

-- The platform for a typed company name: an existing one with that name,
-- or a new newsletter-only platform (site address from the listing).
create function private.platform_for_name(p_name text, p_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_slug text := btrim(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'), '-');
  v_id uuid;
begin
  if v_name = '' or length(v_name) > 100 or v_slug = '' then
    raise exception 'invalid company name' using errcode = '22023';
  end if;
  select p.id into v_id from public.platforms p
  where lower(p.name) = lower(v_name) or p.slug = v_slug
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.platforms (slug, name, site_url, newsletter_only)
  values (v_slug, v_name, substring(p_url from '^https://[^/?#]+'), true)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.platform_for_name(text, text) from public;

-- Adds a hand-picked listing. Give a platform id or a company name.
create function public.admin_save_listing(
  p_platform_id uuid,
  p_platform_name text,
  p_title text,
  p_url text,
  p_summary text,
  p_pay_min numeric,
  p_pay_max numeric,
  p_pay_unit public.pay_unit,
  p_countries text[],
  p_posted_at timestamptz,
  p_verified_at timestamptz,
  p_review_of uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform uuid := p_platform_id;
  v_id uuid;
begin
  perform private.require_admin();
  if v_platform is null then
    v_platform := private.platform_for_name(p_platform_name, p_url);
  end if;
  insert into public.jobs (
    platform_id, external_id, title, summary, pay_min, pay_max, pay_unit,
    countries, url, posted_at, source, verified_at, review_of
  )
  values (
    v_platform, 'manual-' || gen_random_uuid(), btrim(p_title),
    nullif(btrim(p_summary), ''), p_pay_min, p_pay_max, p_pay_unit,
    coalesce(p_countries, '{}'), p_url, p_posted_at, 'manual',
    p_verified_at, p_review_of
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Updates a hand-picked listing in place (the "updated" outcome).
create function public.admin_update_listing(
  p_job_id uuid,
  p_title text,
  p_url text,
  p_summary text,
  p_pay_min numeric,
  p_pay_max numeric,
  p_pay_unit public.pay_unit,
  p_countries text[],
  p_posted_at timestamptz,
  p_verified_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.jobs
  set title = btrim(p_title),
      url = p_url,
      summary = nullif(btrim(p_summary), ''),
      pay_min = p_pay_min,
      pay_max = p_pay_max,
      pay_unit = p_pay_unit,
      countries = coalesce(p_countries, '{}'),
      posted_at = coalesce(p_posted_at, posted_at),
      verified_at = p_verified_at,
      last_seen_at = now()
  where id = p_job_id and source = 'manual' and status = 'open';
  return found;
end;
$$;

-- Hand-picked listings for the page: open first, newest first.
create function public.admin_listings()
returns table (
  id uuid,
  platform_name text,
  title text,
  url text,
  pay_min numeric,
  pay_max numeric,
  pay_unit public.pay_unit,
  countries text[],
  posted_at timestamptz,
  verified_at timestamptz,
  status public.job_status,
  review_of uuid,
  review_title text,
  review_url text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select j.id, p.name, j.title, j.url, j.pay_min, j.pay_max, j.pay_unit,
         j.countries, j.posted_at, j.verified_at, j.status, j.review_of,
         r.title, r.url, j.created_at
  from public.jobs j
  join public.platforms p on p.id = j.platform_id
  left join public.jobs r on r.id = j.review_of
  where j.source = 'manual'
  order by (j.status = 'open') desc, (j.review_of is not null) desc,
           j.created_at desc
  limit 200;
end;
$$;

-- The editor closes a listing that is no longer open (never deleted).
create function public.admin_close_listing(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.jobs
  set status = 'closed', closed_at = now(), review_of = null
  where id = p_job_id and source = 'manual' and status = 'open';
  return found;
end;
$$;

-- "Uncertain" listings: keep (not a repeat) or drop (a repeat: closed).
create function public.admin_resolve_listing(p_job_id uuid, p_keep boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_keep then
    update public.jobs set review_of = null
    where id = p_job_id and source = 'manual' and review_of is not null;
  else
    update public.jobs
    set status = 'closed', closed_at = now(), review_of = null
    where id = p_job_id and source = 'manual' and review_of is not null
      and status = 'open';
  end if;
  return found;
end;
$$;

revoke all on function public.admin_platforms() from public, anon;
revoke all on function public.admin_listing_candidates(uuid, text) from public, anon;
revoke all on function public.admin_save_listing(uuid, text, text, text, text, numeric, numeric, public.pay_unit, text[], timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.admin_update_listing(uuid, text, text, text, numeric, numeric, public.pay_unit, text[], timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_listings() from public, anon;
revoke all on function public.admin_close_listing(uuid) from public, anon;
revoke all on function public.admin_resolve_listing(uuid, boolean) from public, anon;

grant execute on function public.admin_platforms() to authenticated;
grant execute on function public.admin_listing_candidates(uuid, text) to authenticated;
grant execute on function public.admin_save_listing(uuid, text, text, text, text, numeric, numeric, public.pay_unit, text[], timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_update_listing(uuid, text, text, text, numeric, numeric, public.pay_unit, text[], timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_listings() to authenticated;
grant execute on function public.admin_close_listing(uuid) to authenticated;
grant execute on function public.admin_resolve_listing(uuid, boolean) to authenticated;
