-- Newsletter N4: The Numbers count only jobs that are really new.
--
-- A source's first successful run imports every listing it has, and each
-- one gets that run's start as its first-seen time. Counting those as "new"
-- made a newly added source look like a hiring wave (the first dry run's
-- weekly post: "language, up from 0 to 786"). From now on a job counts as
-- new only if it was first seen after its source's first successful run.
-- Hand-picked listings always count. "other" is a catch-all, not a field,
-- so it is left out of the field rankings. Signature and grants unchanged.

create or replace function public.newsletter_numbers(
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
    with baseline as (
      -- When each source's first successful run started: its backlog.
      select r.platform_id, min(r.started_at) as first_run
      from public.ingest_runs r
      where r.error is null
      group by r.platform_id
    ),
    countable as (
      select j.*
      from public.jobs j
      left join baseline b on b.platform_id = j.platform_id
      where j.review_of is null
        and (j.source = 'manual' or b.first_run is null
             or j.first_seen_at > b.first_run)
    ),
    fresh as (
      select c.*, p.name as platform
      from countable c
      join public.platforms p on p.id = c.platform_id
      where c.first_seen_at >= p_from and c.first_seen_at < p_to
    ),
    previous as (
      select c.domain
      from countable c
      where c.first_seen_at >= v_prev_from and c.first_seen_at < p_from
    ),
    growth as (
      select f.domain, count(*) as current,
        (select count(*) from previous pr where pr.domain = f.domain) as previous
      from fresh f
      where f.domain is not null and f.domain <> 'other'
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
          where domain is not null and domain <> 'other'
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
