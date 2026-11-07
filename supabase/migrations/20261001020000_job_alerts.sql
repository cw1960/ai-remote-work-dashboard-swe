-- Job alerts (Phase 4): saved feed searches emailed daily or weekly.
--
-- saved_searches.filters holds the feed filters in a canonical shape, built
-- and validated by the app (src/lib/alerts/saved-search.ts):
--   {"q": text, "platforms": [slug], "domains": [domain],
--    "languages": [code], "country": "XX", "minPay": int}
-- with every key optional. A job is "new" for a search when it was first
-- seen after the search's last alert (or its creation).
--
-- Like reminders, pg_cron calls the app's /api/cron/alerts route with the
-- cron token from Vault; due_job_alerts() and mark_job_alerts_sent() check it.

-- One row per distinct search per user, and at most 10 searches each.
create unique index saved_searches_user_filters_key
  on public.saved_searches (user_id, filters);

create function private.limit_saved_searches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 10 then
    raise exception 'at most 10 saved searches' using errcode = 'P0010';
  end if;
  return new;
end;
$$;

create trigger limit_saved_searches before insert on public.saved_searches
  for each row execute function private.limit_saved_searches();

-- Whether an open job matches a search's filters (same rules as the feed).
create function private.job_matches(p_job public.jobs, p_slug text, p_filters jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (coalesce(p_filters ->> 'q', '') = ''
      or p_job.title ilike '%' || replace(replace(replace(p_filters ->> 'q', '\', '\\'), '%', '\%'), '_', '\_') || '%')
    and (not p_filters ? 'platforms' or jsonb_array_length(p_filters -> 'platforms') = 0
      or (p_filters -> 'platforms') ? p_slug)
    and (not p_filters ? 'domains' or jsonb_array_length(p_filters -> 'domains') = 0
      or (p_job.domain is not null and (p_filters -> 'domains') ? p_job.domain))
    and (not p_filters ? 'languages' or jsonb_array_length(p_filters -> 'languages') = 0
      or p_job.languages && array(select jsonb_array_elements_text(p_filters -> 'languages')))
    and (p_filters ->> 'country' is null
      or ((p_job.countries = '{}' or (p_filters ->> 'country') = any (p_job.countries))
          and not (p_filters ->> 'country') = any (p_job.countries_blocked)))
    and (p_filters ->> 'minPay' is null
      or (p_job.pay_unit = 'hour' and p_job.pay_max >= (p_filters ->> 'minPay')::numeric))
$$;

revoke all on function private.job_matches(public.jobs, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Saved searches due an alert at p_now, for users with alerts on: daily ones
-- last sent 20+ hours ago, weekly ones 6 days 20 hours ago (so a run a few
-- minutes early or late never skips a day). Each row carries the number of
-- new matches and up to 10 of them, newest first. Rows with no new matches
-- are returned too, so the app can mark them as checked.
-- ---------------------------------------------------------------------------
create function public.due_job_alerts(p_token text, p_now timestamptz)
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

-- Records that these searches were checked (and emailed, if they had news)
-- at p_at. Cron token required.
create function public.mark_job_alerts_sent(p_token text, p_search_ids uuid[], p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_cron_token(p_token) then
    raise exception 'invalid cron token' using errcode = '28000';
  end if;
  update public.saved_searches
  set last_sent_at = p_at
  where id = any (p_search_ids);
end;
$$;

revoke all on function public.mark_job_alerts_sent(text, uuid[], timestamptz) from public;
grant execute on function public.mark_job_alerts_sent(text, uuid[], timestamptz) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Schedule: once a day at 14:00 UTC, an hour after reminders.
-- ---------------------------------------------------------------------------
create function private.invoke_job_alerts()
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
    raise notice 'job alerts not configured (app_url or cron_token missing); skipping';
    return null;
  end if;

  return net.http_post(
    url := v_url || '/api/cron/alerts',
    body := jsonb_build_object('at', now()),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.invoke_job_alerts() from public;

select cron.schedule('email-job-alerts', '0 14 * * *', $$select private.invoke_job_alerts()$$);
