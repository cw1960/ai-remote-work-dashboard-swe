-- Today panel (Phase 5): "new matches since your last visit".
--
-- A visit is a dashboard view more than an hour after the last one, so the
-- page can refresh during a visit (every card move does) without losing
-- what was new when it began. Users can't write these columns directly:
-- only through dashboard_visit(), which stamps the caller's own row.

alter table public.profiles
  add column last_dashboard_at timestamptz,
  add column previous_dashboard_at timestamptz;

-- Records a dashboard view and returns when the previous visit was (null
-- on the first).
create function public.dashboard_visit()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles p
  set
    previous_dashboard_at = case
      when p.last_dashboard_at is null
        or p.last_dashboard_at < now() - interval '1 hour'
      then p.last_dashboard_at
      else p.previous_dashboard_at
    end,
    last_dashboard_at = case
      when p.last_dashboard_at is null
        or p.last_dashboard_at < now() - interval '1 hour'
      then now()
      else p.last_dashboard_at
    end
  where p.user_id = auth.uid()
  returning p.previous_dashboard_at
$$;

revoke all on function public.dashboard_visit() from public, anon;
grant execute on function public.dashboard_visit() to authenticated;
