-- Newsletter N4 (PR B): emailing the social drafts, and the admin view.
--
-- The newsletter workflow calls /api/newsletter/notify with its token; the
-- route reads a run's unsent drafts and marks them sent through the two
-- token-gated functions below, so the app holds no service role key. The
-- admin_newsletter_* functions feed /admin/newsletter.

-- ---------------------------------------------------------------------------
-- Draft emails (newsletter token)
-- ---------------------------------------------------------------------------

-- A run's drafts that have not been emailed yet.
create function public.newsletter_unsent_drafts(p_token text, p_run_id uuid)
returns table (
  id uuid,
  channel text,
  body text,
  kind text,
  issue_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  return query
  select d.id, d.channel, d.body, r.kind, r.issue_date
  from public.social_drafts d
  join public.newsletter_runs r on r.id = d.run_id
  where d.run_id = p_run_id and d.emailed_at is null
  order by d.created_at, d.channel, d.id;
end;
$$;

-- Records that drafts went out by email.
create function public.newsletter_mark_drafts_emailed(p_token text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  update public.social_drafts
  set emailed_at = now()
  where id = any (p_ids) and emailed_at is null;
end;
$$;

-- Token-gated: the route calls them with the public (anon) key. Signed-in
-- users get nothing (Supabase grants them new functions by default).
revoke all on function public.newsletter_unsent_drafts(text, uuid) from public, authenticated;
revoke all on function public.newsletter_mark_drafts_emailed(text, uuid[]) from public, authenticated;
grant execute on function public.newsletter_unsent_drafts(text, uuid) to anon, service_role;
grant execute on function public.newsletter_mark_drafts_emailed(text, uuid[]) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Admin view (admins only)
-- ---------------------------------------------------------------------------

-- Model spend over the last 7 and 30 days and this calendar month (UTC).
create function public.admin_newsletter_cost()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return (
    select jsonb_build_object(
      'last_7d', coalesce(sum(cost_usd) filter (where started_at > now() - interval '7 days'), 0),
      'last_30d', coalesce(sum(cost_usd) filter (where started_at > now() - interval '30 days'), 0),
      'this_month', coalesce(sum(cost_usd) filter (where started_at >= date_trunc('month', now())), 0)
    )
    from public.newsletter_runs
  );
end;
$$;

-- The latest runs, newest first, with how much each produced.
create function public.admin_newsletter_runs(p_limit integer default 30)
returns table (
  id uuid,
  kind text,
  issue_date date,
  started_at timestamptz,
  status text,
  cost_usd numeric,
  web_searches integer,
  error text,
  shortlisted integer,
  drafts integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select r.id, r.kind, r.issue_date, r.started_at, r.status, r.cost_usd,
         r.web_searches, r.error,
         (select count(*)::integer from public.job_shortlists s where s.run_id = r.id),
         (select count(*)::integer from public.social_drafts d where d.run_id = r.id)
  from public.newsletter_runs r
  order by r.started_at desc, r.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- A run's shortlist, in rank order.
create function public.admin_newsletter_shortlist(p_run_id uuid)
returns table (
  rank integer,
  job_id uuid,
  title text,
  platform text,
  url text,
  reason text,
  caveats text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select s.rank::integer, j.id, j.title, p.name, j.url, s.reason, s.caveats
  from public.job_shortlists s
  join public.jobs j on j.id = s.job_id
  join public.platforms p on p.id = j.platform_id
  where s.run_id = p_run_id
  order by s.rank;
end;
$$;

-- A run's social drafts.
create function public.admin_newsletter_drafts(p_run_id uuid)
returns table (
  id uuid,
  channel text,
  body text,
  emailed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select d.id, d.channel, d.body, d.emailed_at
  from public.social_drafts d
  where d.run_id = p_run_id
  order by d.created_at, d.channel, d.id;
end;
$$;

revoke all on function public.admin_newsletter_cost() from public, anon;
revoke all on function public.admin_newsletter_runs(integer) from public, anon;
revoke all on function public.admin_newsletter_shortlist(uuid) from public, anon;
revoke all on function public.admin_newsletter_drafts(uuid) from public, anon;

grant execute on function public.admin_newsletter_cost() to authenticated;
grant execute on function public.admin_newsletter_runs(integer) to authenticated;
grant execute on function public.admin_newsletter_shortlist(uuid) to authenticated;
grant execute on function public.admin_newsletter_drafts(uuid) to authenticated;
