-- Weekly recap email (Phase 6): every Monday, the past week on the user's
-- board (applications, responses, stage changes) and their top 5 matches.
--
-- The recap is sent by the cron route without a user session, so the
-- matching rules move into private.score_jobs (no session check), shared
-- by match_jobs (signed-in users, their own profile only) and due_recaps.

create function private.score_jobs(
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

-- Same contract as before: callers only ever match themselves.
create or replace function public.match_jobs(
  p_user_id uuid default auth.uid(),
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
security definer
set search_path = ''
as $$
  select s.*
  from private.score_jobs(p_user_id, p_limit, p_job_ids) s
  where p_user_id = auth.uid()
$$;

alter table public.email_prefs add column last_recap_on date;

-- Everyone due a recap on p_day (a Monday): recaps on, not sent in the
-- last 6 days, and something to report. Cron token required.
create function public.due_recaps(p_token text, p_day date)
returns table (
  user_id uuid,
  email text,
  locale text,
  unsubscribe_token text,
  applied integer,
  responses integer,
  moves integer,
  matches jsonb
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
  with due as (
    select e.user_id, u.email::text as email, p.locale, e.unsubscribe_token
    from public.email_prefs e
    join public.profiles p on p.user_id = e.user_id
    join auth.users u on u.id = e.user_id
    where e.recap_on
      and (e.last_recap_on is null or e.last_recap_on <= p_day - 7)
      and u.email is not null
  ),
  week as (
    select
      ev.user_id,
      count(distinct ev.card_id) filter (where ev.to_stage = 'applied')::integer as applied,
      count(distinct ev.card_id) filter (
        where ev.to_stage in ('assessment', 'interviewing', 'offered', 'rejected')
      )::integer as responses,
      count(*) filter (where ev.from_stage is not null)::integer as moves
    from public.card_events ev
    where ev.at >= (p_day - 7)::timestamptz and ev.at < p_day::timestamptz
    group by ev.user_id
  )
  select
    d.user_id,
    d.email,
    d.locale,
    d.unsubscribe_token,
    coalesce(w.applied, 0),
    coalesce(w.responses, 0),
    coalesce(w.moves, 0),
    coalesce(m.matches, '[]'::jsonb)
  from due d
  left join week w on w.user_id = d.user_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'title', j.title,
        'platform', pl.name,
        'pay_min', j.pay_min,
        'pay_max', j.pay_max,
        'pay_unit', j.pay_unit
      )
      order by s.score desc, s.job_id
    ) as matches
    from private.score_jobs(d.user_id, 5) s
    join public.jobs j on j.id = s.job_id
    join public.platforms pl on pl.id = j.platform_id
    where s.matched_domain is not null
      or cardinality(s.matched_languages) > 0
      or s.pay_ok
      or s.country_ok is not null
  ) m on true
  where w.user_id is not null
    or exists (select 1 from public.tracker_cards c where c.user_id = d.user_id)
    or m.matches is not null;
end;
$$;

revoke all on function public.due_recaps(text, date) from public, authenticated;
grant execute on function public.due_recaps(text, date) to anon, service_role;

-- Records that a user's recap for p_day went out. Cron token required.
create function public.mark_recap_sent(p_token text, p_user_id uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_cron_token(p_token) then
    raise exception 'invalid cron token' using errcode = '28000';
  end if;
  update public.email_prefs
  set last_recap_on = p_day
  where user_id = p_user_id;
end;
$$;

revoke all on function public.mark_recap_sent(text, uuid, date) from public, authenticated;
grant execute on function public.mark_recap_sent(text, uuid, date) to anon, service_role;

-- pg_cron → POST {app_url}/api/cron/recap, like the reminders.
create function private.invoke_recaps()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'cron_token';

  if v_url is null or v_token is null then
    raise notice 'recaps not configured (app_url or cron_token missing); skipping';
    return null;
  end if;

  return net.http_post(
    url := v_url || '/api/cron/recap',
    body := jsonb_build_object('day', (now() at time zone 'utc')::date),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.invoke_recaps() from public;

-- Mondays at 15:00 UTC (after reminders at 13:00 and alerts at 14:00).
select cron.schedule('email-weekly-recap', '0 15 * * 1', $$select private.invoke_recaps()$$);
