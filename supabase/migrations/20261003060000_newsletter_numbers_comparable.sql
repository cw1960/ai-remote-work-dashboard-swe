-- Newsletter N4: compare like with like in "fastest-growing field".
--
-- The second dry run still said "finance went from 0 to 9": the previous
-- week came before Mercor and micro1 were running at all, so every field
-- looked like it grew from nothing. The comparison now uses only feed jobs
-- from sources that were already running when the earlier period began.
-- Until a full comparable period exists there is no fastest-growing field
-- (null), which the newsletter reports as nothing rather than a false
-- jump. Everything else in The Numbers is unchanged. Signature and grants
-- unchanged.

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
    comparable as (
      -- Feed jobs from sources already running when the earlier period
      -- began, so both periods are measured the same way.
      select c.domain, c.first_seen_at
      from countable c
      join baseline b on b.platform_id = c.platform_id
      where c.source = 'feed' and b.first_run <= v_prev_from
        and c.domain is not null and c.domain <> 'other'
        and c.first_seen_at >= v_prev_from and c.first_seen_at < p_to
    ),
    growth as (
      select g.domain,
        count(*) filter (where g.first_seen_at >= p_from) as current,
        count(*) filter (where g.first_seen_at < p_from) as previous
      from comparable g
      group by g.domain
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
