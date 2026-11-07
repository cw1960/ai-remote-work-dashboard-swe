-- Resume tailoring (2026-10-14): a user keeps one master resume and asks for
-- a version tailored to a job. Generation runs in the tailor-resume Edge
-- Function as the signed-in user; these functions are its only way to write.
--
-- Privacy: only extracted text is kept, never the uploaded file. Resume text
-- and job descriptions are never written to logs; resume_generations records
-- usage (tokens, outcome) without content.

create type public.tailored_resume_status as enum ('draft', 'saved');

-- ---------------------------------------------------------------------------
-- master_resumes (owner). One active row per user. Replacing a resume keeps
-- the earlier version only while a tailored resume still points at it, so
-- tailored resumes stay tied to the text they were made from.
-- ---------------------------------------------------------------------------
create table public.master_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 255),
  file_type text not null check (file_type in ('pdf', 'docx')),
  -- Size of the uploaded file in bytes (4 MB max); the file itself is not kept.
  file_size integer not null check (file_size between 1 and 4194304),
  content text not null check (length(content) between 200 and 50000),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index master_resumes_one_active_key
  on public.master_resumes (user_id) where is_active;
create index master_resumes_user_created_idx
  on public.master_resumes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- tailored_resumes (owner). One row per generation; re-tailoring a job adds
-- a version and never overwrites an earlier one. Job title and company are
-- snapshots, so the resume reads the same if the listing changes.
-- ---------------------------------------------------------------------------
create table public.tailored_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete restrict,
  -- Null once the user deletes their master resume.
  master_resume_id uuid
    references public.master_resumes (id) on delete set null,
  version integer not null check (version >= 1),
  job_title text not null check (length(job_title) between 1 and 300),
  company text not null check (length(company) between 1 and 200),
  -- The resume itself (see _shared/resume/schema.ts).
  content jsonb not null
    check (jsonb_typeof(content) = 'object' and length(content::text) <= 100000),
  -- The model's notes: changes, emphasized qualifications, gaps, flags.
  review jsonb not null default '{}'
    check (jsonb_typeof(review) = 'object' and length(review::text) <= 50000),
  status public.tailored_resume_status not null default 'draft',
  model text check (length(model) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  saved_at timestamptz,
  unique (user_id, job_id, version),
  check ((status = 'saved') = (saved_at is not null))
);

create index tailored_resumes_user_job_idx
  on public.tailored_resumes (user_id, job_id, version desc);
create index tailored_resumes_master_idx
  on public.tailored_resumes (master_resume_id)
  where master_resume_id is not null;

create trigger set_updated_at before update on public.tailored_resumes
  for each row execute function private.set_updated_at();

-- The tailored resume chosen for an application. Set by
-- save_tailored_resume(), never directly (FK checks ignore RLS).
alter table public.tracker_cards
  add column tailored_resume_id uuid
    references public.tailored_resumes (id) on delete set null;

-- ---------------------------------------------------------------------------
-- resume_generations (no user access): one row per generation attempt, for
-- the daily limit, the one-at-a-time lock and cost tracking. No content.
-- ---------------------------------------------------------------------------
create table public.resume_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  master_resume_id uuid
    references public.master_resumes (id) on delete set null,
  job_title text not null,
  company text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  -- An error class such as "rate_limited", never provider text or content.
  error text check (error ~ '^[a-z_]{1,40}$'),
  model text check (length(model) <= 100),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  tailored_resume_id uuid
    references public.tailored_resumes (id) on delete set null,
  check ((finished_at is null) = (ok is null))
);

create index resume_generations_user_started_idx
  on public.resume_generations (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Privileges and policies. Users read and delete their own rows; every write
-- goes through the functions below.
-- ---------------------------------------------------------------------------
alter table public.master_resumes enable row level security;
alter table public.tailored_resumes enable row level security;
alter table public.resume_generations enable row level security;

revoke all on public.master_resumes, public.tailored_resumes,
  public.resume_generations from anon, authenticated;
grant select, delete on public.master_resumes to authenticated;
grant select, delete on public.tailored_resumes to authenticated;

create policy "Users read their own master resumes"
  on public.master_resumes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users delete their own master resumes"
  on public.master_resumes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own tailored resumes"
  on public.tailored_resumes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users delete their own tailored resumes"
  on public.tailored_resumes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Functions. Errors are raised with a stable message the app maps to copy:
-- not_authenticated, no_master_resume, job_not_found, generation_in_progress,
-- daily_limit, not_found, invalid.
-- ---------------------------------------------------------------------------

-- Generations each user may start per rolling 24 hours (failed ones are not
-- counted). Change it here; the app reads it through resume_tailoring_usage().
create function private.resume_daily_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

-- A generation not finished after this long is treated as abandoned.
create function private.resume_generation_timeout()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '3 minutes' $$;

/** Stores a new master resume and makes it the active one. */
create function public.replace_master_resume(
  p_file_name text,
  p_file_type text,
  p_file_size integer,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.master_resumes set is_active = false
  where user_id = v_user and is_active;

  insert into public.master_resumes
    (user_id, file_name, file_type, file_size, content)
  values (v_user, p_file_name, p_file_type, p_file_size, p_content)
  returning id into v_id;

  -- Earlier versions are kept only while a tailored resume uses them.
  delete from public.master_resumes m
  where m.user_id = v_user
    and not m.is_active
    and not exists (
      select 1 from public.tailored_resumes t where t.master_resume_id = m.id
    );

  return v_id;
end;
$$;

/** How many generations the user has used in the last 24 hours, of how many. */
create function public.resume_tailoring_usage()
returns table (used integer, daily_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, private.resume_daily_limit()
  from public.resume_generations g
  where g.user_id = auth.uid()
    and g.started_at > now() - interval '24 hours'
    and (g.ok or g.finished_at is null)
$$;

/**
 * Called by the tailor-resume function before it asks the model. Checks the
 * job, the master resume, the one-at-a-time lock and the daily limit, then
 * records the attempt and returns what the prompt needs.
 */
create function public.start_resume_generation(p_job_id uuid)
returns table (
  generation_id bigint,
  master_resume_id uuid,
  master_content text,
  job_title text,
  company text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_title text;
  v_company text;
  v_master_id uuid;
  v_master_content text;
  v_id bigint;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select j.title, p.name into v_title, v_company
  from public.jobs j
  join public.platforms p on p.id = j.platform_id
  where j.id = p_job_id and j.status = 'open';
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;

  select m.id, m.content into v_master_id, v_master_content
  from public.master_resumes m
  where m.user_id = v_user and m.is_active;
  if not found then
    raise exception 'no_master_resume' using errcode = 'P0002';
  end if;

  -- Serialize this user's starts so the checks below can't race.
  perform pg_advisory_xact_lock(hashtextextended('resume:' || v_user::text, 0));

  -- Close attempts that never finished (the function crashed or timed out).
  update public.resume_generations
  set finished_at = now(), ok = false, error = 'abandoned'
  where user_id = v_user
    and finished_at is null
    and started_at <= now() - private.resume_generation_timeout();

  if exists (
    select 1 from public.resume_generations
    where user_id = v_user and finished_at is null
  ) then
    raise exception 'generation_in_progress' using errcode = 'P0001';
  end if;

  if (select u.used from public.resume_tailoring_usage() u)
     >= private.resume_daily_limit() then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;

  insert into public.resume_generations
    (user_id, job_id, master_resume_id, job_title, company)
  values (v_user, p_job_id, v_master_id, v_title, v_company)
  returning id into v_id;

  return query select v_id, v_master_id, v_master_content, v_title, v_company;
end;
$$;

/**
 * Called by the tailor-resume function when the model has answered (or
 * failed). On success it stores the result as the next draft version for the
 * job and returns its id; on failure it records the error class only.
 */
create function public.finish_resume_generation(
  p_generation_id bigint,
  p_ok boolean,
  p_error text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_content jsonb,
  p_review jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_generation public.resume_generations;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_generation
  from public.resume_generations
  where id = p_generation_id and user_id = v_user and finished_at is null
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_ok then
    if p_content is null or p_review is null then
      raise exception 'invalid' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(
      hashtextextended('resume:' || v_user::text, 0)
    );
    insert into public.tailored_resumes (
      user_id, job_id, master_resume_id, version, job_title, company,
      content, review, model
    )
    select v_user, v_generation.job_id, v_generation.master_resume_id,
      coalesce(max(t.version), 0) + 1, v_generation.job_title,
      v_generation.company, p_content, p_review, p_model
    from public.tailored_resumes t
    where t.user_id = v_user and t.job_id = v_generation.job_id
    returning id into v_id;
  end if;

  update public.resume_generations
  set finished_at = now(),
      ok = p_ok,
      error = case when p_ok then null else coalesce(p_error, 'failed') end,
      model = p_model,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      tailored_resume_id = v_id
  where id = p_generation_id;

  return v_id;
end;
$$;

/**
 * Updates a tailored resume's content. With p_final it becomes the saved
 * (approved) version, and the user's tracker card for the job, if any, points
 * at it. Never touches the master resume.
 */
create function public.save_tailored_resume(
  p_id uuid,
  p_content jsonb,
  p_final boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_job uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'invalid' using errcode = '22023';
  end if;

  update public.tailored_resumes
  set content = p_content,
      status = case when p_final then 'saved' else status end,
      saved_at = case when p_final then now() else saved_at end
  where id = p_id and user_id = v_user
  returning job_id into v_job;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_final then
    update public.tracker_cards
    set tailored_resume_id = p_id
    where user_id = v_user and kind = 'job' and job_id = v_job;
  end if;
end;
$$;

revoke all on function private.resume_daily_limit() from public;
revoke all on function private.resume_generation_timeout() from public;
revoke all on function public.replace_master_resume(text, text, integer, text)
  from public, anon;
revoke all on function public.resume_tailoring_usage() from public, anon;
revoke all on function public.start_resume_generation(uuid) from public, anon;
revoke all on function public.finish_resume_generation(
  bigint, boolean, text, text, integer, integer, jsonb, jsonb
) from public, anon;
revoke all on function public.save_tailored_resume(uuid, jsonb, boolean)
  from public, anon;

grant execute on function public.replace_master_resume(text, text, integer, text)
  to authenticated;
grant execute on function public.resume_tailoring_usage() to authenticated;
grant execute on function public.start_resume_generation(uuid) to authenticated;
grant execute on function public.finish_resume_generation(
  bigint, boolean, text, text, integer, integer, jsonb, jsonb
) to authenticated;
grant execute on function public.save_tailored_resume(uuid, jsonb, boolean)
  to authenticated;
