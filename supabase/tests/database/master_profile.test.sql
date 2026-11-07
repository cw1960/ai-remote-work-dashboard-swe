-- Master Profile: resume text and core skills/evidence saved as one master
-- resume version, carried over on upload, and handed to the tailor.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-00000000aa02', 'ana@example.com'),
  ('00000000-0000-0000-0000-00000000bb02', 'ben@example.com');

insert into public.jobs (id, platform_id, external_id, title, url)
select '00000000-0000-0000-0000-0000000000e1', p.id, 'profile-test-1',
  'Spanish Tutor', 'https://mercor.example/jobs/p1'
from public.platforms p where p.slug = 'mercor';

create temporary table ids (name text primary key, id uuid) on commit drop;
grant select, insert on ids to authenticated;

select ok(
  not has_function_privilege('anon', 'public.save_master_profile(text, text)', 'execute'),
  'signed-out visitors cannot save a master profile'
);

-- Ana -------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000aa02","role":"authenticated"}', true);

select throws_ok(
  $$ select public.save_master_profile('Too short.', '') $$,
  '22023', 'invalid', 'the resume text needs at least 200 characters'
);
select throws_ok(
  $$ select public.save_master_profile(repeat('x', 300), repeat('y', 20001)) $$,
  '22023', 'invalid', 'evidence is capped at 20,000 characters'
);

insert into ids select 'pasted', public.save_master_profile(
  '  ' || repeat('Ana Lopez. Teacher at Colegio Sol 2019-2024. ', 10) || '  ',
  'Raised pass rates 18% in 2023.');

select results_eq(
  $$ select file_name, file_type, is_active, evidence, left(content, 9)
     from public.master_resumes $$,
  $$ values ('Master Profile'::text, 'text'::text, true,
       'Raised pass rates 18% in 2023.'::text, 'Ana Lopez'::text) $$,
  'pasted text becomes the active version, trimmed, with its evidence'
);

select is(
  public.save_master_profile(
    repeat('Ana Lopez. Teacher at Colegio Sol 2019-2024. ', 10),
    'Raised pass rates 18% in 2023.'),
  (select id from ids where name = 'pasted'),
  'saving without changes keeps the same version'
);

-- A tailored resume made from this version keeps it alive.
insert into ids
select 'tailored', public.finish_resume_generation(
  (select generation_id
   from public.start_resume_generation('00000000-0000-0000-0000-0000000000e1')),
  true, null, 'claude-opus-5-5', 1, 1, '{"name": "Ana Lopez"}', '{"changes": []}');

-- An upload replaces the text and keeps the evidence.
insert into ids select 'upload', public.replace_master_resume(
  'ana.pdf', 'pdf', 120000, repeat('Ana Lopez. Teacher and tutor 2019-2025. ', 10));

select results_eq(
  $$ select file_name, file_type, evidence from public.master_resumes where is_active $$,
  $$ values ('ana.pdf'::text, 'pdf'::text, 'Raised pass rates 18% in 2023.'::text) $$,
  'an upload keeps the evidence'
);
select is(
  (select count(*)::int from public.master_resumes),
  2,
  'the version a tailored resume uses is kept'
);
select throws_ok(
  $$ select public.replace_master_resume('ana.txt', 'text', 10, repeat('x', 300)) $$,
  '22023', 'invalid', 'uploads are PDF or Word only'
);

-- Only the evidence changes: the file details stay.
insert into ids select 'evidence', public.save_master_profile(
  repeat('Ana Lopez. Teacher and tutor 2019-2025. ', 10),
  'Raised pass rates 18% in 2023. Built a 400-question rubric bank.');

select results_eq(
  $$ select file_name, file_type, file_size from public.master_resumes where is_active $$,
  $$ values ('ana.pdf'::text, 'pdf'::text, 120000) $$,
  'changing only the evidence keeps the uploaded file details'
);
select isnt(
  (select id from ids where name = 'evidence'),
  (select id from ids where name = 'upload'),
  'changing the evidence makes a new version'
);
select is(
  (select count(*)::int from public.master_resumes),
  2,
  'versions no tailored resume uses are removed'
);

-- Editing the text makes it typed text.
select public.save_master_profile(
  repeat('Ana Lopez. Teacher and tutor 2019-2025, Madrid. ', 10),
  'Raised pass rates 18% in 2023. Built a 400-question rubric bank.');
select results_eq(
  $$ select file_name, file_type from public.master_resumes where is_active $$,
  $$ values ('Master Profile'::text, 'text'::text) $$,
  'edited text is stored as typed text'
);

-- The tailor receives both parts.
select results_eq(
  $$ select left(master_content, 9), master_evidence
     from public.start_resume_generation('00000000-0000-0000-0000-0000000000e1') $$,
  $$ values ('Ana Lopez'::text,
       'Raised pass rates 18% in 2023. Built a 400-question rubric bank.'::text) $$,
  'a generation gets the resume text and the evidence'
);

-- Ben ----------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000bb02","role":"authenticated"}', true);

select is_empty(
  $$ select id from public.master_resumes $$,
  'users cannot see another user''s master profile'
);
select throws_ok(
  $$ select * from public.start_resume_generation('00000000-0000-0000-0000-0000000000e1') $$,
  'P0002', 'no_master_resume', 'tailoring still needs a master profile'
);

reset role;
select * from finish();
rollback;
