-- Admin area (/admin): site activity, newsletter signups, job source health
-- and the list of accounts. Read-only: admins can look, not change.
--
-- Owner's decision (2026-10-03): the editor is an admin, with the same access as
-- the owner, including account email addresses (the Privacy Notice says so).

insert into private.admins (email) values ('editor@example.com')
on conflict (email) do nothing;

-- Site activity in one call.
create function public.admin_site_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'onboarded', (select count(*) from public.profiles where onboarded_at is not null),
    'active_7d', (select count(*) from public.profiles
                  where last_dashboard_at > now() - interval '7 days'),
    'cards', (select count(*) from public.tracker_cards),
    'applied', (select count(*) from public.tracker_cards where applied_at is not null)
  );
end;
$$;

-- Newsletter signups from the site's forms, by form and campaign tags.
create function public.admin_signup_stats()
returns table (
  source text,
  utm_source text,
  utm_campaign text,
  last_7d integer,
  last_30d integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select e.source, e.utm_source, e.utm_campaign,
         (count(*) filter (where e.at > now() - interval '7 days'))::integer,
         count(*)::integer
  from public.site_events e
  where e.event = 'newsletter_signup'
    and e.at > now() - interval '30 days'
  group by e.source, e.utm_source, e.utm_campaign
  order by 5 desc, 1, 2 nulls first, 3 nulls first;
end;
$$;

-- One row per job source that has run: its latest run, how many runs in a
-- row have failed, and its open jobs.
create function public.admin_source_health()
returns table (
  slug text,
  name text,
  newsletter_only boolean,
  last_started_at timestamptz,
  last_found integer,
  last_error text,
  failures_in_row integer,
  open_jobs integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select p.slug, p.name, p.newsletter_only,
         last_run.started_at, last_run.found, last_run.error,
         (select count(*)::integer from public.ingest_runs r
          where r.platform_id = p.id
            and r.error is not null
            and r.started_at > coalesce(
              (select max(ok.started_at) from public.ingest_runs ok
               where ok.platform_id = p.id and ok.error is null),
              '-infinity'::timestamptz)),
         (select count(*)::integer from public.jobs j
          where j.platform_id = p.id and j.status = 'open' and j.source = 'feed')
  from public.platforms p
  join lateral (
    select r.started_at, r.found, r.error
    from public.ingest_runs r
    where r.platform_id = p.id
    order by r.started_at desc
    limit 1
  ) last_run on true
  order by p.name;
end;
$$;

-- Accounts, newest first, optionally filtered by email; total is the count
-- of all matches (for paging).
create function public.admin_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  onboarded boolean,
  cards integer,
  total integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
         p.onboarded_at is not null,
         (select count(*)::integer from public.tracker_cards c where c.user_id = u.id),
         (count(*) over ())::integer
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where nullif(btrim(p_search), '') is null
     or u.email ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by u.created_at desc, u.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_site_stats() from public, anon;
revoke all on function public.admin_signup_stats() from public, anon;
revoke all on function public.admin_source_health() from public, anon;
revoke all on function public.admin_users(text, integer, integer) from public, anon;

grant execute on function public.admin_site_stats() to authenticated;
grant execute on function public.admin_signup_stats() to authenticated;
grant execute on function public.admin_source_health() to authenticated;
grant execute on function public.admin_users(text, integer, integer) to authenticated;
