-- Resume tailoring: master resume versions, generation lock and daily
-- limit, tailored versions per job, saving, and owner-only access.
begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000aa01', 'ana@example.com'),
  ('00000000-0000-0000-0000-00000000bb01', 'ben@example.com');

insert into public.jobs (id, platform_id, external_id, title, url)
select '00000000-0000-0000-0000-0000000000f1', p.id, 'resume-test-1',
  'Spanish Tutor', 'https://mercor.example/jobs/1'
from public.platforms p where p.slug = 'mercor';
insert into public.jobs (id, platform_id, external_id, title, url)
select '00000000-0000-0000-0000-0000000000f2', p.id, 'resume-test-2',
  'Legal Expert', 'https://mercor.example/jobs/2'
from public.platforms p where p.slug = 'mercor';

create temporary table ids (name text primary key, id uuid) on commit drop;
grant select, insert, update on ids to authenticated;

-- Privileges ----------------------------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.resume_generations', 'select'),
  'users cannot read the generation log'
);
select ok(
  not has_table_privilege('authenticated', 'public.tailored_resumes', 'insert')
  and not has_table_privilege('authenticated', 'public.tailored_resumes', 'update'),
  'users write tailored resumes only through the functions'
);
select ok(
  not has_table_privilege('authenticated', 'public.master_resumes', 'insert')
  and not has_table_privilege('authenticated', 'public.master_resumes', 'update'),
  'users write master resumes only through replace_master_resume()'
);
select ok(
  not has_function_privilege('anon', 'public.start_resume_generation(uuid)', 'execute'),
  'signed-out visitors cannot start a generation'
);

-- Ana, before uploading -----------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.start_resume_generation('00000000-0000-0000-0000-0000000000f1') $$,
  'P0002', 'no_master_resume', 'tailoring needs a master resume'
);

insert into ids select 'master1', public.replace_master_resume(
  'ana.pdf', 'pdf', 120000, repeat('Ana Lopez. Teacher at Colegio Sol 2019-2024. ', 10));

select results_eq(
  $$ select file_name, is_active from public.master_resumes $$,
  $$ values ('ana.pdf'::text, true) $$,
  'the upload is the active master resume'
);
select throws_ok(
  $$ select * from public.start_resume_generation(gen_random_uuid()) $$,
  'P0002', 'job_not_found', 'an unknown job cannot be tailored for'
);

-- First generation ------------------------------------------------------------

create temporary table gen (n int primary key, id bigint) on commit drop;
grant select, insert on gen to authenticated;

insert into gen
select 1, generation_id
from public.start_resume_generation('00000000-0000-0000-0000-0000000000f1');

select throws_ok(
  $$ select * from public.start_resume_generation('00000000-0000-0000-0000-0000000000f2') $$,
  'P0001', 'generation_in_progress', 'only one generation runs at a time'
);

insert into ids select 'v1', public.finish_resume_generation(
  (select id from gen where n = 1), true, null, 'claude-opus-5-5', 3000, 2000,
  '{"name": "Ana Lopez"}', '{"changes": []}');

select results_eq(
  $$ select version, status::text, job_title, company, master_resume_id
     from public.tailored_resumes where id = (select id from ids where name = 'v1') $$,
  $$ select 1, 'draft'::text, 'Spanish Tutor'::text, 'Mercor'::text,
       (select id from ids where name = 'master1') $$,
  'the result is a draft, version 1, tied to the job and the master resume'
);
select results_eq(
  $$ select * from public.resume_tailoring_usage() $$,
  $$ values (1, 5) $$,
  'one of five daily generations used'
);

-- A failed generation is recorded but not counted ----------------------------

insert into gen
select 2, generation_id
from public.start_resume_generation('00000000-0000-0000-0000-0000000000f1');
select is(
  public.finish_resume_generation((select id from gen where n = 2), false,
    'rate_limited', 'claude-opus-5-5', null, null, null, null),
  null::uuid,
  'a failed generation stores no resume'
);
select results_eq(
  $$ select used from public.resume_tailoring_usage() $$,
  $$ values (1) $$,
  'a failed generation does not count toward the limit'
);
select throws_ok(
  format('select public.finish_resume_generation(%s, true, null, null, 1, 1, %L, %L)',
    (select id from gen where n = 2), '{}', '{}'),
  'P0002', 'not_found', 'a finished generation cannot be finished again'
);

-- Re-tailoring the same job adds a version -----------------------------------

insert into gen
select 3, generation_id
from public.start_resume_generation('00000000-0000-0000-0000-0000000000f1');
insert into ids select 'v2', public.finish_resume_generation(
  (select id from gen where n = 3), true, null, 'claude-opus-5-5', 3000, 2000,
  '{"name": "Ana Lopez", "summary": "v2"}', '{}');

select results_eq(
  $$ select version, content from public.tailored_resumes
     where job_id = '00000000-0000-0000-0000-0000000000f1' order by version $$,
  $$ values (1, '{"name": "Ana Lopez"}'::jsonb),
            (2, '{"name": "Ana Lopez", "summary": "v2"}'::jsonb) $$,
  're-tailoring adds version 2 and keeps version 1 unchanged'
);

-- Saving ----------------------------------------------------------------------

insert into public.tracker_cards (kind, job_id, title)
values ('job', '00000000-0000-0000-0000-0000000000f1', 'Spanish Tutor');

select lives_ok(
  format('select public.save_tailored_resume(%L, %L, false)',
    (select id from ids where name = 'v2'), '{"name": "Ana Lopez", "summary": "edited"}'),
  'a draft can be edited'
);
select results_eq(
  $$ select status::text, content->>'summary' from public.tailored_resumes
     where id = (select id from ids where name = 'v2') $$,
  $$ values ('draft'::text, 'edited'::text) $$,
  'editing keeps it a draft'
);
select lives_ok(
  format('select public.save_tailored_resume(%L, %L, true)',
    (select id from ids where name = 'v2'), '{"name": "Ana Lopez", "summary": "final"}'),
  'a draft can be saved'
);
select results_eq(
  $$ select status::text, saved_at is not null from public.tailored_resumes
     where id = (select id from ids where name = 'v2') $$,
  $$ values ('saved'::text, true) $$,
  'saving marks it saved'
);
select is(
  (select tailored_resume_id from public.tracker_cards
   where job_id = '00000000-0000-0000-0000-0000000000f1'),
  (select id from ids where name = 'v2'),
  'the job''s tracker card points at the saved version'
);
select throws_ok(
  format('select public.save_tailored_resume(%L, %L, true)',
    (select id from ids where name = 'v2'), '[]'),
  '22023', 'invalid', 'content must be an object'
);

-- Replacing the master resume -------------------------------------------------

insert into ids select 'master2', public.replace_master_resume(
  'ana-2026.docx', 'docx', 40000, repeat('Ana Lopez. Lead teacher at Colegio Sol. ', 10));

select results_eq(
  $$ select id, is_active from public.master_resumes order by created_at, is_active $$,
  $$ values ((select id from ids where name = 'master1'), false),
            ((select id from ids where name = 'master2'), true) $$,
  'the old version stays, inactive, because tailored resumes use it'
);
select is(
  (select count(*)::int from public.tailored_resumes
   where master_resume_id = (select id from ids where name = 'master1')),
  2,
  'tailored resumes keep pointing at the version they were made from'
);

insert into ids select 'master3', public.replace_master_resume(
  'ana-final.pdf', 'pdf', 50000, repeat('Ana Lopez. Head of languages at Colegio Sol. ', 10));
select ok(
  not exists (select 1 from public.master_resumes
              where id = (select id from ids where name = 'master2')),
  'an unused earlier version is deleted on the next upload'
);
select is(
  (select count(*)::int from public.master_resumes where is_active), 1,
  'exactly one master resume is active'
);

-- Ben cannot see or touch Ana's resumes ----------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000bb01","role":"authenticated"}', true);

select is((select count(*)::int from public.master_resumes), 0,
  'Ben sees none of Ana''s master resumes');
select is((select count(*)::int from public.tailored_resumes), 0,
  'Ben sees none of Ana''s tailored resumes');
select throws_ok(
  format('select public.save_tailored_resume(%L, %L, true)',
    (select id from ids where name = 'v1'), '{"name": "Ben"}'),
  'P0002', 'not_found', 'Ben cannot overwrite Ana''s tailored resume'
);
select throws_ok(
  format('select public.finish_resume_generation(%s, true, null, null, 1, 1, %L, %L)',
    (select max(id) from gen), '{}', '{}'),
  'P0002', 'not_found', 'Ben cannot finish Ana''s generation'
);
delete from public.tailored_resumes where id = (select id from ids where name = 'v1');
delete from public.master_resumes;

-- Back as Ana: Ben's deletes did nothing --------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);

select is((select count(*)::int from public.tailored_resumes), 2,
  'Ben''s delete did not remove Ana''s tailored resumes');
select is((select count(*)::int from public.master_resumes), 2,
  'Ben''s delete did not remove Ana''s master resumes');

-- The daily limit ------------------------------------------------------------

reset role;
insert into public.resume_generations
  (user_id, job_id, job_title, company, finished_at, ok)
select '00000000-0000-0000-0000-00000000aa01',
  '00000000-0000-0000-0000-0000000000f2', 'Legal Expert', 'Mercor', now(), true
from generate_series(1, 3);
set local role authenticated;

select results_eq(
  $$ select used from public.resume_tailoring_usage() $$,
  $$ values (5) $$,
  'five generations used'
);
select throws_ok(
  $$ select * from public.start_resume_generation('00000000-0000-0000-0000-0000000000f2') $$,
  'P0001', 'daily_limit', 'a sixth generation in 24 hours is refused'
);

-- Deleting the master resume ---------------------------------------------------

delete from public.master_resumes;
select is((select count(*)::int from public.master_resumes), 0,
  'Ana can delete her master resume, every version');
select results_eq(
  $$ select count(*)::int, count(master_resume_id)::int from public.tailored_resumes $$,
  $$ values (2, 0) $$,
  'tailored resumes stay, no longer linked to a master resume'
);
select throws_ok(
  $$ select * from public.start_resume_generation('00000000-0000-0000-0000-0000000000f1') $$,
  'P0002', 'no_master_resume', 'without a master resume, tailoring asks for one'
);

select * from finish();
rollback;
