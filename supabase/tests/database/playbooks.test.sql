-- Playbooks: every listed platform has one per stage, readable by anyone.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select is_empty(
  $$ select p.slug, s.stage
     from public.platforms p
     cross join unnest(enum_range(null::public.card_stage)) as s(stage)
     where p.listed
       and not exists (
         select 1 from public.playbooks b
         where b.platform_id = p.id and b.stage = s.stage
       ) $$,
  'every listed platform has a playbook for every stage'
);
select is_empty(
  $$ select 1 from public.playbooks
     where jsonb_array_length(checklist) = 0
       or exists (
         select 1 from jsonb_array_elements(checklist) item
         where jsonb_typeof(item) <> 'string'
       ) $$,
  'every checklist is a non-empty list of strings'
);

set local role anon;
select ok(
  (select count(*) from public.playbooks) >= 36,
  'signed-out visitors can read playbooks'
);

select * from finish();
rollback;
