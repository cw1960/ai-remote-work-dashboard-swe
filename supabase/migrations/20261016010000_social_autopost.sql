-- Newsletter social posts (owner, 2026-10-16): daily posts drafted from the
-- issue the editor sent, posted automatically to Bluesky and X, and Reddit
-- drafts for the owner to post by hand.
--
-- The newsletter workflow (cw1960/airemoteworktoday) saves each post with a
-- time; an hourly job claims the posts that are due and records the result.
-- Only these channels can be scheduled; everything else stays a draft.
-- Claiming marks a post 'posting' first, so two overlapping runs can never
-- post it twice, and a post more than 3 hours late is skipped, not posted.

-- ---------------------------------------------------------------------------
-- Runs and drafts
-- ---------------------------------------------------------------------------

-- 'social': the morning run that drafts the day's posts from the sent issue.
alter table public.newsletter_runs
  drop constraint newsletter_runs_kind_check,
  add constraint newsletter_runs_kind_check
    check (kind in ('daily', 'weekly', 'social'));

-- One social run per issue day, so the day's posts can't be scheduled twice.
-- A failed run doesn't count: the workflow saves posts as its last step, so
-- a failed run scheduled nothing and may be retried.
create unique index newsletter_runs_one_social_per_day
  on public.newsletter_runs (issue_date)
  where kind = 'social' and status <> 'failed';

alter table public.social_drafts
  drop constraint social_drafts_channel_check,
  add constraint social_drafts_channel_check
    check (channel in (
      'linkedin', 'x', 'reddit', 'video', 'bluesky', 'threads', 'facebook'
    )),
  -- Reddit drafts have a title of their own.
  add column title text check (char_length(title) between 1 and 300),
  add column scheduled_for timestamptz,
  add column status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'posting', 'posted', 'failed', 'skipped')),
  add column posted_at timestamptz,
  add column post_url text check (char_length(post_url) <= 500),
  add column post_error text check (char_length(post_error) <= 1000),
  add constraint social_drafts_schedulable_check
    check (
      scheduled_for is null
      or channel in ('bluesky', 'x', 'threads', 'facebook')
    ),
  add constraint social_drafts_lifecycle_check
    check (
      (status = 'draft') = (scheduled_for is null)
      and (status = 'posted') = (posted_at is not null)
    );

comment on table public.social_drafts is
  'Social posts from the newsletter workflow: drafts to post by hand, and '
  'scheduled posts the workflow publishes to Bluesky and X. Admin only.';

create index social_drafts_due_idx
  on public.social_drafts (scheduled_for)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Saving drafts (replaces the N4 version: same signature)
-- ---------------------------------------------------------------------------

-- Replaces the run's drafts: p_drafts is [{channel, body, title?,
-- scheduled_for?}]. A draft with a time is scheduled; without one it stays a
-- draft to copy by hand.
create or replace function public.newsletter_save_drafts(
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
  insert into public.social_drafts
    (run_id, channel, body, title, scheduled_for, status)
  select p_run_id, x.channel, x.body, nullif(btrim(x.title), ''),
    x.scheduled_for,
    case when x.scheduled_for is null then 'draft' else 'scheduled' end
  from jsonb_to_recordset(p_drafts)
    as x(channel text, body text, title text, scheduled_for timestamptz);
end;
$$;

-- ---------------------------------------------------------------------------
-- Posting (newsletter token)
-- ---------------------------------------------------------------------------

-- Skips posts more than 3 hours late, then claims up to p_limit due posts on
-- the given channels: they become 'posting' and are returned to the caller,
-- which must report each one with newsletter_finish_post(). A post left in
-- 'posting' (the job died mid-post) is never claimed again, so it can't be
-- posted twice; it shows in the admin area to check by hand.
create function public.newsletter_claim_due_posts(
  p_token text,
  p_channels text[],
  p_limit integer default 5
)
returns table (
  id uuid,
  channel text,
  body text,
  scheduled_for timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);

  update public.social_drafts d
  set status = 'skipped',
      post_error = 'More than 3 hours late; not posted.'
  where d.status = 'scheduled'
    and d.scheduled_for < now() - interval '3 hours';

  return query
  with due as (
    select s.id
    from public.social_drafts s
    where s.status = 'scheduled'
      and s.scheduled_for <= now()
      and s.channel = any (p_channels)
    order by s.scheduled_for, s.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update skip locked
  ),
  claimed as (
    update public.social_drafts d
    set status = 'posting'
    from due
    where d.id = due.id
    returning d.id, d.channel, d.body, d.scheduled_for
  )
  select c.id, c.channel, c.body, c.scheduled_for
  from claimed c
  order by c.scheduled_for, c.id;
end;
$$;

-- Records how a claimed post went: posted (with its URL) or failed (with the
-- error). Only a post in 'posting' can be finished.
create function public.newsletter_finish_post(
  p_token text,
  p_id uuid,
  p_posted boolean,
  p_post_url text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  update public.social_drafts
  set status = case when p_posted then 'posted' else 'failed' end,
      posted_at = case when p_posted then now() end,
      post_url = case when p_posted then left(p_post_url, 500) end,
      post_error = case when p_posted then null else left(p_error, 1000) end
  where id = p_id and status = 'posting';
  if not found then
    raise exception 'no post % waiting for a result', p_id using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft emails and the admin view: now with titles, times and results.
-- Their return types change, so they are dropped and recreated.
-- ---------------------------------------------------------------------------

drop function public.newsletter_unsent_drafts(text, uuid);

create function public.newsletter_unsent_drafts(p_token text, p_run_id uuid)
returns table (
  id uuid,
  channel text,
  body text,
  title text,
  scheduled_for timestamptz,
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
  select d.id, d.channel, d.body, d.title, d.scheduled_for, r.kind,
    r.issue_date
  from public.social_drafts d
  join public.newsletter_runs r on r.id = d.run_id
  where d.run_id = p_run_id and d.emailed_at is null
  order by d.scheduled_for nulls last, d.created_at, d.channel, d.id;
end;
$$;

drop function public.admin_newsletter_drafts(uuid);

create function public.admin_newsletter_drafts(p_run_id uuid)
returns table (
  id uuid,
  channel text,
  body text,
  title text,
  emailed_at timestamptz,
  scheduled_for timestamptz,
  status text,
  posted_at timestamptz,
  post_url text,
  post_error text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select d.id, d.channel, d.body, d.title, d.emailed_at, d.scheduled_for,
    d.status, d.posted_at, d.post_url, d.post_error
  from public.social_drafts d
  where d.run_id = p_run_id
  order by d.scheduled_for nulls last, d.created_at, d.channel, d.id;
end;
$$;

-- Token-gated ones run with the public (anon) key; signed-in users get
-- nothing (Supabase grants them new functions by default).
revoke all on function public.newsletter_claim_due_posts(text, text[], integer) from public, authenticated;
revoke all on function public.newsletter_finish_post(text, uuid, boolean, text, text) from public, authenticated;
revoke all on function public.newsletter_unsent_drafts(text, uuid) from public, authenticated;
grant execute on function public.newsletter_claim_due_posts(text, text[], integer) to anon, service_role;
grant execute on function public.newsletter_finish_post(text, uuid, boolean, text, text) to anon, service_role;
grant execute on function public.newsletter_unsent_drafts(text, uuid) to anon, service_role;

revoke all on function public.admin_newsletter_drafts(uuid) from public, anon;
grant execute on function public.admin_newsletter_drafts(uuid) to authenticated;
