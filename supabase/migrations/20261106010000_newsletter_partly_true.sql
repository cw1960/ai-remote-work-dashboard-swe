-- Newsletter pivot P3 (owner, 2026-11-05): a fourth story status.
--
-- 'partly_true': the core of the claim holds, but part of it is wrong or
-- unsupported (an investigation that isn't confirmed, a figure missing its
-- context). Like 'confirmed' it needs a sourced fact, and it needs a
-- correction saying what the sources actually show. Additive: existing
-- stories keep their statuses.

alter table public.listen_stories
  drop constraint listen_stories_status_check,
  add constraint listen_stories_status_check
    check (status in ('confirmed', 'partly_true', 'false', 'unconfirmed'));

-- Replaces a listen's stories. p_stories is an array, in rank order, of
-- {claim, status, correction, heat, division, spread, communities,
--  threads: [reddit_id], facts: [{statement, sources: [{url, title,
--  cited_text}]}], quotes: [{thread, comment, side}]}.
-- Threads and comments are referred to by their Reddit ids within the
-- listen; anything that isn't in the listen is refused, so a quote can only
-- be a stored comment. A confirmed or partly true story needs at least one
-- sourced fact; a partly true story also needs a correction.
create or replace function public.newsletter_save_stories(
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

    if v_story ->> 'status' in ('confirmed', 'partly_true') and v_fact_pos = 0 then
      raise exception 'a % story needs a sourced fact', v_story ->> 'status'
        using errcode = '22023';
    end if;
    if v_story ->> 'status' = 'partly_true'
       and coalesce(v_story ->> 'correction', '') = '' then
      raise exception 'a partly true story needs a correction' using errcode = '22023';
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
