-- Master Profile (2026-10-15): the master resume gains "Core skills and
-- evidence" (results, tools, projects, certifications the resume leaves out),
-- and its text can be pasted or edited instead of only uploaded.
--
-- Both parts belong to one master_resumes version, so a tailored resume
-- stays tied to exactly what it was made from, and changing either part
-- makes earlier tailored resumes "outdated" like a new upload does. The
-- tailor-resume function receives both; the evidence counts as fact.

alter table public.master_resumes
  add column evidence text not null default ''
    check (length(evidence) <= 20000);

-- Text typed or pasted on the Master Profile page has no file.
alter table public.master_resumes
  drop constraint master_resumes_file_type_check,
  add constraint master_resumes_file_type_check
    check (file_type in ('pdf', 'docx', 'text'));

-- ---------------------------------------------------------------------------
-- replace_master_resume(): an uploaded file. The evidence carries over from
-- the active version, so uploading a new resume never loses it.
-- ---------------------------------------------------------------------------
create or replace function public.replace_master_resume(
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
  v_evidence text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_file_type not in ('pdf', 'docx') then
    raise exception 'invalid' using errcode = '22023';
  end if;

  select m.evidence into v_evidence
  from public.master_resumes m
  where m.user_id = v_user and m.is_active;

  update public.master_resumes set is_active = false
  where user_id = v_user and is_active;

  insert into public.master_resumes
    (user_id, file_name, file_type, file_size, content, evidence)
  values (v_user, p_file_name, p_file_type, p_file_size, p_content,
    coalesce(v_evidence, ''))
  returning id into v_id;

  perform private.prune_master_resumes(v_user);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_master_profile(): the Master Profile form. Stores the resume text and
-- evidence as a new version, unless nothing changed. When only the evidence
-- changed, the version keeps the uploaded file's name and type.
-- ---------------------------------------------------------------------------
create function public.save_master_profile(
  p_content text,
  p_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_content text := btrim(coalesce(p_content, ''));
  v_evidence text := btrim(coalesce(p_evidence, ''));
  v_active public.master_resumes;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if length(v_content) not between 200 and 50000
     or length(v_evidence) > 20000 then
    raise exception 'invalid' using errcode = '22023';
  end if;

  select * into v_active
  from public.master_resumes m
  where m.user_id = v_user and m.is_active;

  -- Compared trimmed: uploaded text may end in whitespace the form drops.
  if found and btrim(v_active.content) = v_content
     and v_active.evidence = v_evidence then
    return v_active.id;
  end if;

  update public.master_resumes set is_active = false
  where user_id = v_user and is_active;

  if v_active.id is not null and btrim(v_active.content) = v_content then
    insert into public.master_resumes
      (user_id, file_name, file_type, file_size, content, evidence)
    values (v_user, v_active.file_name, v_active.file_type,
      v_active.file_size, v_content, v_evidence)
    returning id into v_id;
  else
    insert into public.master_resumes
      (user_id, file_name, file_type, file_size, content, evidence)
    values (v_user, 'Master Profile', 'text', octet_length(v_content),
      v_content, v_evidence)
    returning id into v_id;
  end if;

  perform private.prune_master_resumes(v_user);
  return v_id;
end;
$$;

-- Earlier versions are kept only while a tailored resume uses them.
create function private.prune_master_resumes(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.master_resumes m
  where m.user_id = p_user
    and not m.is_active
    and not exists (
      select 1 from public.tailored_resumes t where t.master_resume_id = m.id
    )
$$;

-- ---------------------------------------------------------------------------
-- start_resume_generation(): unchanged checks; also returns the evidence.
-- The return type changes, so the function is recreated.
-- ---------------------------------------------------------------------------
drop function public.start_resume_generation(uuid);

create function public.start_resume_generation(p_job_id uuid)
returns table (
  generation_id bigint,
  master_resume_id uuid,
  master_content text,
  master_evidence text,
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
  v_master_evidence text;
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

  select m.id, m.content, m.evidence
  into v_master_id, v_master_content, v_master_evidence
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

  return query select v_id, v_master_id, v_master_content, v_master_evidence,
    v_title, v_company;
end;
$$;

revoke all on function private.prune_master_resumes(uuid) from public;
revoke all on function public.save_master_profile(text, text) from public, anon;
revoke all on function public.start_resume_generation(uuid) from public, anon;

grant execute on function public.save_master_profile(text, text)
  to authenticated;
grant execute on function public.start_resume_generation(uuid) to authenticated;
