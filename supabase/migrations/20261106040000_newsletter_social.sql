-- Newsletter pivot P8 (owner, 2026-11-05): social, rebuilt.
--
-- Every day the issue the editor sent becomes 8-10 posts each on X, Bluesky
-- and Threads, posted automatically (cw1960/airemoteworktoday,
-- docs/distribution.md). The posts now carry more than text:
--
-- - an image (the issue's illustration, or a quote card), with alt text;
-- - a thread: a post can reply to an earlier post of the same run on the
--   same channel, and is claimed only once that post is up (a reply to a
--   post that failed or was skipped is skipped too);
-- - a poll (X): 2 to 4 options of at most 25 characters, and its length;
-- - its kind (fuse, provocation, quote card...), for measuring which kinds
--   bring subscribers;
-- - the platform's own ids once posted (`post_ref`), which replies need.
--
-- And pg_cron now starts the newsletter repo's social-posts.yml, like the
-- issue (20261106030000): GitHub's own schedule ran hours late, and a post
-- more than 3 hours late is skipped. Additive: the old functions' callers
-- keep working (finish_post's new argument has a default).

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

alter table public.social_drafts
  add column image_url text
    check (image_url ~ '^https://' and char_length(image_url) <= 500),
  add column image_alt text check (char_length(image_alt) between 1 and 1000),
  add column reply_to uuid references public.social_drafts (id) on delete cascade,
  add column poll_options text[]
    check (cardinality(poll_options) between 2 and 4),
  add column poll_minutes integer check (poll_minutes between 5 and 10080),
  add column kind text check (kind ~ '^[a-z][a-z_]{0,39}$'),
  add column post_ref jsonb check (octet_length(post_ref::text) <= 2000),
  add constraint social_drafts_image_check
    check ((image_url is null) = (image_alt is null)),
  add constraint social_drafts_poll_check
    check (
      (poll_options is null) = (poll_minutes is null)
      and (poll_options is null or channel = 'x')
    ),
  add constraint social_drafts_reply_check
    check (reply_to is null or (reply_to <> id and scheduled_for is not null));

create index social_drafts_reply_idx on public.social_drafts (reply_to)
  where reply_to is not null;

-- ---------------------------------------------------------------------------
-- Saving (same signature; the payload gains optional fields)
-- ---------------------------------------------------------------------------

-- p_drafts is [{id?, channel, body, title?, scheduled_for?, image_url?,
-- image_alt?, reply_to?, poll_options?, poll_minutes?, kind?}]. A reply
-- names the id of a post in the same payload, on the same channel, posted
-- before it.
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

  drop table if exists pg_temp.pending;
  create temp table pending on commit drop as
  select coalesce(x.id, gen_random_uuid()) as id, x.channel, x.body,
    nullif(btrim(x.title), '') as title, x.scheduled_for, x.image_url,
    x.image_alt, x.reply_to, x.poll_options, x.poll_minutes, x.kind
  from jsonb_to_recordset(coalesce(p_drafts, '[]'::jsonb)) as x(
    id uuid, channel text, body text, title text, scheduled_for timestamptz,
    image_url text, image_alt text, reply_to uuid, poll_options text[],
    poll_minutes integer, kind text
  );

  if exists (
    select 1 from pg_temp.pending p
    where p.reply_to is not null and not exists (
      select 1 from pg_temp.pending q
      where q.id = p.reply_to and q.channel = p.channel
        and q.scheduled_for <= p.scheduled_for
    )
  ) then
    raise exception 'a reply must follow a post of this run on its channel'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_temp.pending p, unnest(p.poll_options) as o(option)
    where char_length(btrim(o.option)) not between 1 and 25
  ) then
    raise exception 'poll options must be 1 to 25 characters'
      using errcode = '22023';
  end if;

  delete from public.social_drafts where run_id = p_run_id;
  insert into public.social_drafts
    (id, run_id, channel, body, title, scheduled_for, status, image_url,
     image_alt, reply_to, poll_options, poll_minutes, kind)
  select p.id, p_run_id, p.channel, p.body, p.title, p.scheduled_for,
    case when p.scheduled_for is null then 'draft' else 'scheduled' end,
    p.image_url, p.image_alt, p.reply_to, p.poll_options, p.poll_minutes,
    p.kind
  from pg_temp.pending p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Posting (new return columns, so dropped and recreated)
-- ---------------------------------------------------------------------------

drop function public.newsletter_claim_due_posts(text, text[], integer);

-- Skips posts more than 3 hours late, and replies whose post failed or was
-- skipped; then claims up to p_limit due posts whose post (if they reply to
-- one) is already up. The caller posts them, reports each with
-- newsletter_finish_post(), and claims again until nothing is returned, so
-- a thread goes out in one run.
create function public.newsletter_claim_due_posts(
  p_token text,
  p_channels text[],
  p_limit integer default 5
)
returns table (
  id uuid,
  channel text,
  body text,
  scheduled_for timestamptz,
  image_url text,
  image_alt text,
  reply_to uuid,
  reply_to_ref jsonb,
  poll_options text[],
  poll_minutes integer,
  kind text
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

  -- Repeated so a skip runs down a whole thread.
  loop
    update public.social_drafts d
    set status = 'skipped',
        post_error = 'The post it replies to was not posted.'
    from public.social_drafts p
    where d.reply_to = p.id
      and d.status = 'scheduled'
      and p.status in ('failed', 'skipped');
    exit when not found;
  end loop;

  return query
  with due as (
    select s.id
    from public.social_drafts s
    left join public.social_drafts p on p.id = s.reply_to
    where s.status = 'scheduled'
      and s.scheduled_for <= now()
      and s.channel = any (p_channels)
      and (s.reply_to is null or p.status = 'posted')
    order by s.scheduled_for, s.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of s skip locked
  ),
  claimed as (
    update public.social_drafts d
    set status = 'posting'
    from due
    where d.id = due.id
    returning d.id, d.channel, d.body, d.scheduled_for, d.image_url,
      d.image_alt, d.reply_to, d.poll_options, d.poll_minutes, d.kind
  )
  select c.id, c.channel, c.body, c.scheduled_for, c.image_url, c.image_alt,
    c.reply_to, p.post_ref, c.poll_options, c.poll_minutes, c.kind
  from claimed c
  left join public.social_drafts p on p.id = c.reply_to
  order by c.scheduled_for, c.id;
end;
$$;

drop function public.newsletter_finish_post(text, uuid, boolean, text, text);

-- Records how a claimed post went: posted (with its URL and the platform's
-- ids, which replies to it need) or failed (with the error).
create function public.newsletter_finish_post(
  p_token text,
  p_id uuid,
  p_posted boolean,
  p_post_url text default null,
  p_error text default null,
  p_post_ref jsonb default null
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
      post_ref = case when p_posted then p_post_ref end,
      post_error = case when p_posted then null else left(p_error, 1000) end
  where id = p_id and status = 'posting';
  if not found then
    raise exception 'no post % waiting for a result', p_id using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.newsletter_claim_due_posts(text, text[], integer) from public, authenticated;
revoke all on function public.newsletter_finish_post(text, uuid, boolean, text, text, jsonb) from public, authenticated;
grant execute on function public.newsletter_claim_due_posts(text, text[], integer) to anon, service_role;
grant execute on function public.newsletter_finish_post(text, uuid, boolean, text, text, jsonb) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Schedule: pg_cron starts social-posts.yml (Monterrey is UTC-6 all year)
-- ---------------------------------------------------------------------------

-- 'social' drafts the day's posts from the issue sent that morning (the
-- workflow does nothing once the day's posts exist, so the later starts are
-- retries for a late issue); 'publish' posts whatever is due. Without the
-- `github_dispatch_token` in Vault it does nothing.
create function private.invoke_social_posts(p_task text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if p_task not in ('social', 'publish') then
    raise exception 'unknown social task %', p_task using errcode = '22023';
  end if;
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'github_dispatch_token';
  if v_token is null or v_token = '' then
    raise notice 'social posts not started: github_dispatch_token missing';
    return null;
  end if;
  return net.http_post(
    url := 'https://api.github.com/repos/cw1960/airemoteworktoday/actions/workflows/social-posts.yml/dispatches',
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object(
        'task', p_task, 'dry_run', 'false', 'trigger', 'pg_cron'
      )
    ),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || v_token,
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'AIRemoteWorkDashboard-pg_cron',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.invoke_social_posts(text) from public;

-- Drafting: 08:30 Monterrey, retried hourly until 12:30.
select cron.schedule('social-draft', '30 14-18 * * *',
  $$select private.invoke_social_posts('social')$$);
-- Publishing: hourly from 09:05 to 21:05 Monterrey (15:05-03:05 UTC).
select cron.schedule('social-publish-day', '5 15-23 * * *',
  $$select private.invoke_social_posts('publish')$$);
select cron.schedule('social-publish-night', '5 0-3 * * *',
  $$select private.invoke_social_posts('publish')$$);
