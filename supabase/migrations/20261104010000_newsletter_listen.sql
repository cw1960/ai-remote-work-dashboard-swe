-- Newsletter pivot P2 (owner, 2026-11-04): the Listener.
--
-- Each day the newsletter workflow (cw1960/airemoteworktoday) reads the last
-- day of public Reddit posts and their top comments from the Arctic Shift
-- archive and stores them here, so every quote in an issue can be checked
-- against the text it came from. Usernames are never stored. Rows are kept
-- for 90 days. Admin only: the workflow writes and reads through the
-- token-gated functions below (newsletter token in Vault).

create table public.listen_runs (
  id uuid primary key default gen_random_uuid(),
  window_start timestamptz not null,
  window_end timestamptz not null,
  created_at timestamptz not null default now(),
  threads integer not null default 0 check (threads >= 0),
  comments integer not null default 0 check (comments >= 0),
  check (window_start < window_end)
);

comment on table public.listen_runs is
  'One daily Reddit listen by the newsletter workflow. Admin only.';

create index listen_runs_created_idx on public.listen_runs (created_at desc);

create table public.listen_threads (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.listen_runs (id) on delete cascade,
  reddit_id text not null check (reddit_id ~ '^[a-z0-9]{1,16}$'),
  subreddit text not null check (subreddit ~ '^[A-Za-z0-9_]{2,32}$'),
  title text not null check (char_length(title) between 1 and 500),
  excerpt text check (char_length(excerpt) <= 2000),
  url text not null check (url ~ '^https://www\.reddit\.com/r/'),
  score integer not null,
  num_comments integer not null check (num_comments >= 0),
  upvote_ratio numeric(4, 3) check (upvote_ratio between 0 and 1),
  posted_at timestamptz not null,
  heat numeric(12, 4) not null default 0,
  division numeric(6, 4) not null default 0,
  unique (run_id, reddit_id)
);

comment on table public.listen_threads is
  'Reddit threads from a daily listen, with scores. No usernames. Admin only.';

create index listen_threads_run_heat_idx
  on public.listen_threads (run_id, heat desc);

create table public.listen_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.listen_threads (id) on delete cascade,
  reddit_id text not null check (reddit_id ~ '^[a-z0-9]{1,16}$'),
  body text not null check (char_length(body) between 1 and 2000),
  score integer not null,
  posted_at timestamptz not null,
  unique (thread_id, reddit_id)
);

comment on table public.listen_comments is
  'Top comments on listened threads, for verbatim quotes. No usernames. Admin only.';

create index listen_comments_thread_idx on public.listen_comments (thread_id);

alter table public.listen_runs enable row level security;
alter table public.listen_threads enable row level security;
alter table public.listen_comments enable row level security;

-- New tables get Supabase's default grants; the API roles get none here.
revoke all on public.listen_runs from anon, authenticated;
revoke all on public.listen_threads from anon, authenticated;
revoke all on public.listen_comments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saving a listen
-- ---------------------------------------------------------------------------

-- Stores one listen: p_threads is an array of threads, each with a
-- "comments" array. Returns the run id. Also removes listens older than 90
-- days. At most 2,000 threads and 50 comments per thread.
create function public.newsletter_save_listen(
  p_token text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_threads jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_thread jsonb;
  v_thread_id uuid;
  v_comment jsonb;
  v_threads integer := 0;
  v_comments integer := 0;
begin
  perform private.require_newsletter_token(p_token);
  if jsonb_typeof(p_threads) is distinct from 'array' then
    raise exception 'threads must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_threads) > 2000 then
    raise exception 'at most 2000 threads' using errcode = '22023';
  end if;

  delete from public.listen_runs where created_at < now() - interval '90 days';

  insert into public.listen_runs (window_start, window_end)
  values (p_window_start, p_window_end)
  returning id into v_run;

  for v_thread in select value from jsonb_array_elements(p_threads) loop
    if jsonb_typeof(v_thread -> 'comments') is not distinct from 'array'
       and jsonb_array_length(v_thread -> 'comments') > 50 then
      raise exception 'at most 50 comments per thread' using errcode = '22023';
    end if;
    insert into public.listen_threads (
      run_id, reddit_id, subreddit, title, excerpt, url, score,
      num_comments, upvote_ratio, posted_at, heat, division
    ) values (
      v_run,
      v_thread ->> 'reddit_id',
      v_thread ->> 'subreddit',
      v_thread ->> 'title',
      nullif(v_thread ->> 'excerpt', ''),
      v_thread ->> 'url',
      (v_thread ->> 'score')::integer,
      (v_thread ->> 'num_comments')::integer,
      (v_thread ->> 'upvote_ratio')::numeric,
      (v_thread ->> 'posted_at')::timestamptz,
      coalesce((v_thread ->> 'heat')::numeric, 0),
      coalesce((v_thread ->> 'division')::numeric, 0)
    )
    on conflict (run_id, reddit_id) do nothing
    returning id into v_thread_id;
    continue when v_thread_id is null;
    v_threads := v_threads + 1;

    for v_comment in
      select value from jsonb_array_elements(coalesce(v_thread -> 'comments', '[]'::jsonb))
    loop
      insert into public.listen_comments (thread_id, reddit_id, body, score, posted_at)
      values (
        v_thread_id,
        v_comment ->> 'reddit_id',
        v_comment ->> 'body',
        (v_comment ->> 'score')::integer,
        (v_comment ->> 'posted_at')::timestamptz
      )
      on conflict (thread_id, reddit_id) do nothing;
      if found then
        v_comments := v_comments + 1;
      end if;
    end loop;
  end loop;

  update public.listen_runs
  set threads = v_threads, comments = v_comments
  where id = v_run;
  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading a listen
-- ---------------------------------------------------------------------------

-- A listen's threads, hottest first, each with its comments by score.
create function public.newsletter_listen(
  p_token text,
  p_run_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.heat desc, t.reddit_id)
    from (
      select th.reddit_id, th.subreddit, th.title, th.excerpt, th.url,
             th.score, th.num_comments, th.upvote_ratio, th.posted_at,
             th.heat, th.division,
             coalesce((
               select jsonb_agg(jsonb_build_object(
                        'reddit_id', c.reddit_id, 'body', c.body,
                        'score', c.score, 'posted_at', c.posted_at)
                      order by c.score desc, c.reddit_id)
               from public.listen_comments c
               where c.thread_id = th.id
             ), '[]'::jsonb) as comments
      from public.listen_threads th
      where th.run_id = p_run_id
      order by th.heat desc, th.reddit_id
      limit least(greatest(coalesce(p_limit, 200), 1), 2000)
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.newsletter_save_listen(text, timestamptz, timestamptz, jsonb) from public, authenticated;
revoke all on function public.newsletter_listen(text, uuid, integer) from public, authenticated;
grant execute on function public.newsletter_save_listen(text, timestamptz, timestamptz, jsonb) to anon, service_role;
grant execute on function public.newsletter_listen(text, uuid, integer) to anon, service_role;
