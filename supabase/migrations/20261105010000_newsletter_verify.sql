-- Newsletter pivot P3 (owner, 2026-11-04): the Verifier.
--
-- After each daily listen the newsletter workflow groups the threads into
-- stories, checks each story's facts against reporting found by web search,
-- and picks the strongest comments from each side. It stores the result
-- here so every fact in an issue maps to a source (URL, title, the exact
-- passage cited, when it was read) and every quote to the stored comment it
-- came from. Admin only; written and read through the token-gated functions
-- below. Stories go when their listen goes (90 days).

-- 'verify': the Verifier's run, recorded with its cost like the others.
alter table public.newsletter_runs
  drop constraint newsletter_runs_kind_check,
  add constraint newsletter_runs_kind_check
    check (kind in ('daily', 'weekly', 'social', 'verify'));

create table public.listen_stories (
  id uuid primary key default gen_random_uuid(),
  listen_run_id uuid not null references public.listen_runs (id) on delete cascade,
  rank smallint not null check (rank between 1 and 100),
  claim text not null check (char_length(claim) between 1 and 500),
  -- confirmed: at least one fact is backed by a source; false: reporting
  -- contradicts the claim; unconfirmed: nothing found either way.
  status text not null check (status in ('confirmed', 'false', 'unconfirmed')),
  correction text check (char_length(correction) <= 1000),
  heat numeric(12, 4) not null default 0,
  division numeric(6, 4) not null default 0,
  spread smallint not null default 0 check (spread >= 0),
  communities text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (listen_run_id, rank)
);

comment on table public.listen_stories is
  'Stories grouped from a daily listen, with their verification. Admin only.';

create table public.listen_story_threads (
  story_id uuid not null references public.listen_stories (id) on delete cascade,
  thread_id uuid not null references public.listen_threads (id) on delete cascade,
  primary key (story_id, thread_id)
);

comment on table public.listen_story_threads is
  'Which listened threads make up a story. Admin only.';

create index listen_story_threads_thread_idx on public.listen_story_threads (thread_id);

create table public.story_facts (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.listen_stories (id) on delete cascade,
  position smallint not null check (position between 1 and 50),
  statement text not null check (char_length(statement) between 1 and 1000),
  unique (story_id, position)
);

comment on table public.story_facts is
  'A verified fact about a story, in plain words. Admin only.';

create table public.story_sources (
  id uuid primary key default gen_random_uuid(),
  fact_id uuid not null references public.story_facts (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  title text check (char_length(title) <= 500),
  cited_text text not null check (char_length(cited_text) between 1 and 2000),
  read_at timestamptz not null default now()
);

comment on table public.story_sources is
  'The page and exact passage backing a fact. Admin only.';

create index story_sources_fact_idx on public.story_sources (fact_id);

create table public.story_quotes (
  story_id uuid not null references public.listen_stories (id) on delete cascade,
  comment_id uuid not null references public.listen_comments (id) on delete cascade,
  side text not null check (char_length(side) between 1 and 80),
  primary key (story_id, comment_id)
);

comment on table public.story_quotes is
  'Comments picked to quote for a story, by side. Admin only.';

create index story_quotes_comment_idx on public.story_quotes (comment_id);

alter table public.listen_stories enable row level security;
alter table public.listen_story_threads enable row level security;
alter table public.story_facts enable row level security;
alter table public.story_sources enable row level security;
alter table public.story_quotes enable row level security;

-- New tables get Supabase's default grants; the API roles get none here.
revoke all on public.listen_stories from anon, authenticated;
revoke all on public.listen_story_threads from anon, authenticated;
revoke all on public.story_facts from anon, authenticated;
revoke all on public.story_sources from anon, authenticated;
revoke all on public.story_quotes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The latest listen
-- ---------------------------------------------------------------------------

-- The most recent listen's id, or null when there is none.
create function public.newsletter_latest_listen(p_token text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  return (
    select id from public.listen_runs order by created_at desc, id limit 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Saving stories
-- ---------------------------------------------------------------------------

-- Replaces a listen's stories. p_stories is an array, in rank order, of
-- {claim, status, correction, heat, division, spread, communities,
--  threads: [reddit_id], facts: [{statement, sources: [{url, title,
--  cited_text}]}], quotes: [{thread, comment, side}]}.
-- Threads and comments are referred to by their Reddit ids within the
-- listen; anything that isn't in the listen is refused, so a quote can only
-- be a stored comment. A confirmed story needs at least one sourced fact.
create function public.newsletter_save_stories(
  p_token text,
  p_listen_run_id uuid,
  p_stories jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story jsonb;
  v_story_id uuid;
  v_fact jsonb;
  v_fact_id uuid;
  v_source jsonb;
  v_quote jsonb;
  v_thread_id uuid;
  v_comment_id uuid;
  v_rank integer := 0;
  v_fact_pos integer;
  v_reddit_id text;
begin
  perform private.require_newsletter_token(p_token);
  if not exists (select 1 from public.listen_runs where id = p_listen_run_id) then
    raise exception 'no such listen' using errcode = '22023';
  end if;
  if jsonb_typeof(p_stories) is distinct from 'array'
     or jsonb_array_length(p_stories) > 100 then
    raise exception 'stories must be an array of at most 100' using errcode = '22023';
  end if;

  delete from public.listen_stories where listen_run_id = p_listen_run_id;

  for v_story in select value from jsonb_array_elements(p_stories) loop
    v_rank := v_rank + 1;
    insert into public.listen_stories (
      listen_run_id, rank, claim, status, correction, heat, division,
      spread, communities
    ) values (
      p_listen_run_id, v_rank, v_story ->> 'claim', v_story ->> 'status',
      nullif(v_story ->> 'correction', ''),
      coalesce((v_story ->> 'heat')::numeric, 0),
      coalesce((v_story ->> 'division')::numeric, 0),
      coalesce((v_story ->> 'spread')::smallint, 0),
      coalesce(array(select jsonb_array_elements_text(v_story -> 'communities')), '{}')
    )
    returning id into v_story_id;

    for v_reddit_id in
      select jsonb_array_elements_text(coalesce(v_story -> 'threads', '[]'::jsonb))
    loop
      select id into v_thread_id from public.listen_threads
      where run_id = p_listen_run_id and reddit_id = v_reddit_id;
      if v_thread_id is null then
        raise exception 'thread % is not in this listen', v_reddit_id using errcode = '22023';
      end if;
      insert into public.listen_story_threads (story_id, thread_id)
      values (v_story_id, v_thread_id)
      on conflict do nothing;
    end loop;

    v_fact_pos := 0;
    for v_fact in
      select value from jsonb_array_elements(coalesce(v_story -> 'facts', '[]'::jsonb))
    loop
      if jsonb_array_length(coalesce(v_fact -> 'sources', '[]'::jsonb)) = 0 then
        raise exception 'every fact needs a source' using errcode = '22023';
      end if;
      v_fact_pos := v_fact_pos + 1;
      insert into public.story_facts (story_id, position, statement)
      values (v_story_id, v_fact_pos, v_fact ->> 'statement')
      returning id into v_fact_id;
      for v_source in select value from jsonb_array_elements(v_fact -> 'sources') loop
        insert into public.story_sources (fact_id, url, title, cited_text)
        values (v_fact_id, v_source ->> 'url', nullif(v_source ->> 'title', ''),
                v_source ->> 'cited_text');
      end loop;
    end loop;

    if v_story ->> 'status' = 'confirmed' and v_fact_pos = 0 then
      raise exception 'a confirmed story needs a sourced fact' using errcode = '22023';
    end if;

    for v_quote in
      select value from jsonb_array_elements(coalesce(v_story -> 'quotes', '[]'::jsonb))
    loop
      select c.id into v_comment_id
      from public.listen_comments c
      join public.listen_threads t on t.id = c.thread_id
      join public.listen_story_threads st on st.thread_id = t.id and st.story_id = v_story_id
      where t.run_id = p_listen_run_id
        and t.reddit_id = v_quote ->> 'thread'
        and c.reddit_id = v_quote ->> 'comment';
      if v_comment_id is null then
        raise exception 'comment % is not in this story''s threads', v_quote ->> 'comment'
          using errcode = '22023';
      end if;
      insert into public.story_quotes (story_id, comment_id, side)
      values (v_story_id, v_comment_id, v_quote ->> 'side')
      on conflict do nothing;
    end loop;
  end loop;
  return v_rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading stories
-- ---------------------------------------------------------------------------

-- A listen's stories in rank order, each with its threads, facts and their
-- sources, and the quoted comments (verbatim, as stored).
create function public.newsletter_stories(p_token text, p_listen_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'rank', s.rank, 'claim', s.claim, 'status', s.status,
      'correction', s.correction, 'heat', s.heat, 'division', s.division,
      'spread', s.spread, 'communities', s.communities,
      'threads', coalesce((
        select jsonb_agg(jsonb_build_object(
          'reddit_id', t.reddit_id, 'subreddit', t.subreddit,
          'title', t.title, 'url', t.url) order by t.heat desc, t.reddit_id)
        from public.listen_story_threads st
        join public.listen_threads t on t.id = st.thread_id
        where st.story_id = s.id), '[]'::jsonb),
      'facts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'statement', f.statement,
          'sources', (
            select jsonb_agg(jsonb_build_object(
              'url', src.url, 'title', src.title,
              'cited_text', src.cited_text, 'read_at', src.read_at)
              order by src.url)
            from public.story_sources src where src.fact_id = f.id))
          order by f.position)
        from public.story_facts f where f.story_id = s.id), '[]'::jsonb),
      'quotes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'side', q.side, 'subreddit', t.subreddit, 'url', t.url,
          'body', c.body, 'score', c.score) order by q.side, c.score desc)
        from public.story_quotes q
        join public.listen_comments c on c.id = q.comment_id
        join public.listen_threads t on t.id = c.thread_id
        where q.story_id = s.id), '[]'::jsonb)
    ) order by s.rank)
    from public.listen_stories s
    where s.listen_run_id = p_listen_run_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.newsletter_latest_listen(text) from public, authenticated;
revoke all on function public.newsletter_save_stories(text, uuid, jsonb) from public, authenticated;
revoke all on function public.newsletter_stories(text, uuid) from public, authenticated;
grant execute on function public.newsletter_latest_listen(text) to anon, service_role;
grant execute on function public.newsletter_save_stories(text, uuid, jsonb) to anon, service_role;
grant execute on function public.newsletter_stories(text, uuid) to anon, service_role;
