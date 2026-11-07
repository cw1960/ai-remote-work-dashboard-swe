-- Full job descriptions: stored by the service role only, readable by
-- signed-in users only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixtures (as postgres) ---------------------------------------------------

insert into public.jobs (id, platform_id, external_id, title, url)
select '00000000-0000-0000-0000-0000000000d1', p.id, 'desc-test-1',
  'Spanish Tutor', 'https://mercor.example/jobs/1'
from public.platforms p where p.slug = 'mercor';
insert into public.jobs (id, platform_id, external_id, title, url)
select '00000000-0000-0000-0000-0000000000d2', p.id, 'desc-test-2',
  'Bilingual Psychiatrist', 'https://micro1.example/post/2'
from public.platforms p where p.slug = 'micro1';

-- Privileges ----------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.job_descriptions', 'select'),
  'signed-out visitors cannot read descriptions'
);
select ok(
  not has_table_privilege('authenticated', 'public.job_descriptions', 'insert')
  and not has_table_privilege('authenticated', 'public.job_descriptions', 'update'),
  'users cannot write descriptions'
);
select ok(
  not has_function_privilege('authenticated', 'public.store_job_descriptions(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.store_job_descriptions(text, jsonb)', 'execute'),
  'only the service role stores feed descriptions'
);
select ok(
  not has_function_privilege('authenticated', 'public.save_page_description(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.save_page_description(uuid, text)', 'execute'),
  'only the service role saves page descriptions'
);

-- store_job_descriptions ----------------------------------------------------

select is(
  public.store_job_descriptions('mercor', '[
    {"external_id": "desc-test-1", "content": "  Teach Spanish to AI models.  "},
    {"external_id": "unknown-job", "content": "No such job."},
    {"external_id": "desc-test-1", "content": "Duplicate, ignored."}
  ]'::jsonb),
  1,
  'stores descriptions of known jobs only, once each'
);
select is(
  (select content from public.job_descriptions
   where job_id = '00000000-0000-0000-0000-0000000000d1'),
  'Teach Spanish to AI models.',
  'content is trimmed'
);
select is(
  public.store_job_descriptions('mercor',
    '[{"external_id": "desc-test-1", "content": "Teach Spanish to AI models."}]'::jsonb),
  0,
  'an unchanged description is not rewritten'
);
select is(
  public.store_job_descriptions('mercor',
    '[{"external_id": "desc-test-1", "content": "Updated description."}]'::jsonb),
  1,
  'a changed description is updated'
);
select throws_ok(
  $$ select public.store_job_descriptions('nope', '[]'::jsonb) $$,
  'P0002', 'unknown platform nope', 'an unknown platform is refused'
);

-- save_page_description -------------------------------------------------------

select public.save_page_description('00000000-0000-0000-0000-0000000000d2', '   ');
select ok(
  (select content is null and source = 'page' from public.job_descriptions
   where job_id = '00000000-0000-0000-0000-0000000000d2'),
  'a page without a description is recorded as read'
);
select public.save_page_description('00000000-0000-0000-0000-0000000000d2', 'Assess cases.');
select is(
  (select content from public.job_descriptions
   where job_id = '00000000-0000-0000-0000-0000000000d2'),
  'Assess cases.',
  'a page description is saved'
);
select public.save_page_description('00000000-0000-0000-0000-0000000000d2', null);
select is(
  (select content from public.job_descriptions
   where job_id = '00000000-0000-0000-0000-0000000000d2'),
  'Assess cases.',
  'a later empty read keeps the description'
);

-- Reading -----------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.job_descriptions),
  2,
  'signed-in users read descriptions'
);
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.job_descriptions $$,
  '42501', null, 'signed-out visitors are refused'
);
reset role;

select * from finish();
rollback;
