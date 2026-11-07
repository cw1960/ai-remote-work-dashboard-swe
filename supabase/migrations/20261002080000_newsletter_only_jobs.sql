-- Newsletter-only jobs (newsletter N3). The newsletter may use job sources
-- the site never shows (feed, job pages, sitemap, matching, alerts, recap,
-- tracking, /go). A platform's newsletter_only flag decides it for every job
-- ingested from it; the flag is copied onto each job so the rules stay cheap.
-- Existing platforms (Mercor, micro1, …) stay false: their jobs are on the
-- site and in the newsletter, exactly as before.

alter table public.platforms
  add column newsletter_only boolean not null default false;

alter table public.jobs
  add column newsletter_only boolean not null default false;

-- Kept in step with the platform on insert and update, so ingest_jobs()
-- needs no change and a platform can be moved either way later.
create function private.set_job_newsletter_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.newsletter_only into new.newsletter_only
  from public.platforms p
  where p.id = new.platform_id;
  return new;
end;
$$;

revoke all on function private.set_job_newsletter_only() from public;

create trigger set_job_newsletter_only before insert or update of platform_id
  on public.jobs
  for each row execute function private.set_job_newsletter_only();

create function private.sync_platform_newsletter_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
  set newsletter_only = new.newsletter_only
  where platform_id = new.id
    and newsletter_only is distinct from new.newsletter_only;
  return null;
end;
$$;

revoke all on function private.sync_platform_newsletter_only() from public;

create trigger sync_platform_newsletter_only
  after update of newsletter_only on public.platforms
  for each row
  when (old.newsletter_only is distinct from new.newsletter_only)
  execute function private.sync_platform_newsletter_only();

-- Site reads (anon and signed-in users) see site jobs only. The service
-- role, ingestion and the newsletter's token-gated functions see all.
drop policy "Anyone can read jobs" on public.jobs;
create policy "Anyone can read site jobs"
  on public.jobs for select to anon, authenticated
  using (not newsletter_only);

-- A tracker card can't point at a newsletter-only job (foreign keys ignore
-- RLS, so this is checked here). Reminders and email capture only ever read
-- a user's own cards, so they stay site-only too.
create function private.check_card_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_id is not null and exists (
    select 1 from public.jobs j where j.id = new.job_id and j.newsletter_only
  ) then
    raise exception 'job % not found', new.job_id using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke all on function private.check_card_job() from public;

create trigger check_card_job before insert or update of job_id
  on public.tracker_cards
  for each row execute function private.check_card_job();

-- Security-definer functions bypass RLS, so each filters explicitly.

-- Matching (dashboard, feed reasons, weekly recap).
create or replace function private.score_jobs(
  p_user_id uuid,
  p_limit integer default 20,
  p_job_ids uuid[] default null
)
returns table (
  job_id uuid,
  score integer,
  matched_domain text,
  matched_languages text[],
  pay_ok boolean,
  country_ok text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select p.domains, p.languages, p.country, p.target_rate
    from public.profiles p
    where p.user_id = p_user_id
  ),
  scored as (
    select
      j.id,
      coalesce(j.posted_at, j.first_seen_at) as posted,
      case when j.domain = any (me.domains) then j.domain end as domain_hit,
      array(
        select l from unnest(j.languages) l
        where l = any (me.languages)
        order by l
      ) as language_hits,
      case
        when me.target_rate is null or j.pay_unit is distinct from 'hour'
          or j.pay_max is null then null
        else j.pay_max >= me.target_rate
      end as pay_hit,
      case
        when me.country is not null and cardinality(j.countries) > 0
          and me.country = any (j.countries) then me.country
      end as country_hit,
      me.target_rate,
      j.pay_max
    from public.jobs j
    cross join me
    where j.status = 'open'
      and not j.newsletter_only
      and (p_job_ids is null or j.id = any (p_job_ids))
      -- Eligible where the user lives (unknown country: everything).
      and (
        me.country is null
        or ((cardinality(j.countries) = 0 or me.country = any (j.countries))
            and not me.country = any (j.countries_blocked))
      )
      -- Already on the user's board: no need to suggest it.
      and not exists (
        select 1 from public.tracker_cards c
        where c.user_id = p_user_id and c.job_id = j.id
      )
  )
  select
    s.id,
    (
      case when s.domain_hit is not null then 40 else 0 end
      + case when cardinality(s.language_hits) > 0 then 25 else 0 end
      + case
          when s.pay_hit then 20
          when s.pay_hit is false and s.pay_max < s.target_rate * 0.8 then -10
          else 0
        end
      + case when s.country_hit is not null then 10 else 0 end
      + case
          when s.posted > now() - interval '7 days' then 10
          when s.posted > now() - interval '30 days' then 5
          else 0
        end
    )::integer,
    s.domain_hit,
    s.language_hits,
    s.pay_hit is true,
    s.country_hit
  from scored s
  order by 2 desc, s.posted desc nulls last, s.id
  limit p_limit
$$;

revoke all on function private.score_jobs(uuid, integer, uuid[]) from public;

-- Saved-search alerts.
create or replace function public.due_job_alerts(p_token text, p_now timestamptz)
returns table (
  search_id uuid,
  user_id uuid,
  email text,
  locale text,
  unsubscribe_token text,
  frequency public.search_frequency,
  filters jsonb,
  platform_names text[],
  total integer,
  jobs jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_cron_token(p_token) then
    raise exception 'invalid cron token' using errcode = '28000';
  end if;

  return query
  select
    s.id,
    s.user_id,
    u.email::text,
    p.locale,
    e.unsubscribe_token,
    s.frequency,
    s.filters,
    array(
      select pl.name from public.platforms pl
      where (s.filters -> 'platforms') ? pl.slug
      order by pl.name
    ),
    coalesce(m.total, 0)::integer,
    coalesce(m.jobs, '[]'::jsonb)
  from public.saved_searches s
  join public.email_prefs e on e.user_id = s.user_id
  join public.profiles p on p.user_id = s.user_id
  join auth.users u on u.id = s.user_id
  left join lateral (
    select
      count(*) as total,
      (jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'title', x.title,
          'platform', x.platform,
          'pay_min', x.pay_min,
          'pay_max', x.pay_max,
          'pay_unit', x.pay_unit
        )
        order by x.first_seen_at desc, x.id
      ) filter (where x.rank <= 10)) as jobs
    from (
      select j.id, j.title, pl.name as platform, j.pay_min, j.pay_max,
             j.pay_unit, j.first_seen_at,
             row_number() over (order by j.first_seen_at desc, j.id) as rank
      from public.jobs j
      join public.platforms pl on pl.id = j.platform_id
      where j.status = 'open'
        and not j.newsletter_only
        and j.first_seen_at > coalesce(s.last_sent_at, s.created_at)
        and j.first_seen_at <= p_now
        and private.job_matches(j, pl.slug, s.filters)
    ) x
  ) m on true
  where e.alerts_on
    and u.email is not null
    and coalesce(s.last_sent_at, '-infinity'::timestamptz) <= p_now - case s.frequency
      when 'daily' then interval '20 hours'
      else interval '6 days 20 hours'
    end;
end;
$$;

revoke all on function public.due_job_alerts(text, timestamptz) from public;
grant execute on function public.due_job_alerts(text, timestamptz) to anon, service_role;

-- /go/<job-id>: newsletter-only jobs are "not found", like unknown ids.
create or replace function public.log_outbound_click(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_referral boolean;
begin
  select p.referral_url_template is not null
    into has_referral
  from public.jobs j
  join public.platforms p on p.id = j.platform_id
  where j.id = p_job_id
    and not j.newsletter_only;

  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  insert into public.outbound_clicks (job_id, user_id, referrer_used)
  values (p_job_id, auth.uid(), has_referral);

  return has_referral;
end;
$$;

revoke all on function public.log_outbound_click(uuid) from public;
grant execute on function public.log_outbound_click(uuid)
  to anon, authenticated, service_role;
