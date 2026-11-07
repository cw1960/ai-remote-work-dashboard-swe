-- Full job descriptions for resume tailoring (2026-10-15, owner's decision).
--
-- Jobs keep a short public summary only. The full description is stored
-- here so the tailor can fill it in for the user instead of asking them to
-- copy it from the platform:
--   * Mercor: the Explore page we already read each run carries every
--     listing's description; the ingest function stores it (no extra
--     requests).
--   * micro1: its feed has no description, so the job-description Edge
--     Function reads the job's own page when a signed-in user opens the
--     tailor, at most once per job (a failed read is retried after a day).
--
-- Descriptions are never shown on the site: only signed-in users can read
-- them (the tailor dialog), and only the service role can write them.

create table public.job_descriptions (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  -- Null when the job's page was read but had no description; the read is
  -- not repeated until fetched_at is a day old.
  content text check (length(content) between 1 and 20000),
  source text not null check (source in ('feed', 'page')),
  fetched_at timestamptz not null default now()
);

alter table public.job_descriptions enable row level security;
revoke all on public.job_descriptions from anon, authenticated;
grant select on public.job_descriptions to authenticated;

create policy "Signed-in users can read job descriptions"
  on public.job_descriptions for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- store_job_descriptions(): the ingest function hands over the descriptions
-- from a successful run as [{external_id, content}]. Unchanged rows are not
-- rewritten. Returns the number of rows inserted or changed.
-- ---------------------------------------------------------------------------
create function public.store_job_descriptions(
  p_platform text,
  p_descriptions jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform_id uuid;
  v_count integer;
begin
  select id into v_platform_id from public.platforms where slug = p_platform;
  if not found then
    raise exception 'unknown platform %', p_platform using errcode = 'P0002';
  end if;

  with src as (
    select distinct on (x.external_id) x.external_id, btrim(x.content) as content
    from jsonb_to_recordset(coalesce(p_descriptions, '[]'::jsonb))
      as x(external_id text, content text)
    where length(btrim(x.content)) between 1 and 20000
    order by x.external_id
  )
  insert into public.job_descriptions as d (job_id, content, source, fetched_at)
  select j.id, s.content, 'feed', now()
  from src s
  join public.jobs j
    on j.platform_id = v_platform_id and j.external_id = s.external_id
  on conflict (job_id) do update set
    content = excluded.content,
    source = excluded.source,
    fetched_at = excluded.fetched_at
  where d.content is distinct from excluded.content;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.store_job_descriptions(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.store_job_descriptions(text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- save_page_description(): the job-description function records what it
-- read from a job's own page (null content: the page had none).
-- ---------------------------------------------------------------------------
create function public.save_page_description(
  p_job_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content text := nullif(btrim(p_content), '');
begin
  if v_content is not null and length(v_content) > 20000 then
    v_content := left(v_content, 20000);
  end if;

  insert into public.job_descriptions as d (job_id, content, source, fetched_at)
  values (p_job_id, v_content, 'page', now())
  on conflict (job_id) do update set
    content = coalesce(excluded.content, d.content),
    source = case when excluded.content is null then d.source else excluded.source end,
    fetched_at = excluded.fetched_at;
end;
$$;

revoke all on function public.save_page_description(uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_page_description(uuid, text)
  to service_role;
