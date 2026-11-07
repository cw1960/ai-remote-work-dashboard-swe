-- Newsletter drafts by email (token-gated) and the admin newsletter view.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures (as postgres) ---------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'boss@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'reader@example.com');
insert into private.admins (email) values ('boss@example.com');

create temporary table ids (name text, id uuid) on commit drop;

with job as (
  insert into public.jobs (platform_id, external_id, title, url)
  select p.id, 'nd-1', 'Legal Tutor', 'https://example.com/nd-1'
  from public.platforms p where p.slug = 'xai'
  returning id
)
insert into ids select 'job', id from job;

with runs as (
  insert into public.newsletter_runs
    (kind, issue_date, started_at, finished_at, status, cost_usd)
  values
    ('weekly', '2026-10-05', now() - interval '1 hour', now(), 'succeeded', 0.5),
    ('daily', '2026-09-01', now() - interval '20 days', now() - interval '20 days', 'succeeded', 2)
  returning id, kind
)
insert into ids select kind, id from runs;

insert into public.job_shortlists (run_id, job_id, rank, reason)
values ((select id from ids where name = 'weekly'), (select id from ids where name = 'job'), 1, 'Pays well');

with drafts as (
  insert into public.social_drafts (run_id, channel, body)
  values ((select id from ids where name = 'weekly'), 'linkedin', 'For the editor'),
         ((select id from ids where name = 'weekly'), 'x', 'For Chris')
  returning id, channel
)
insert into ids select channel, id from drafts;

grant select on ids to anon, authenticated;

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to anon;

select ok(not has_function_privilege('authenticated', 'public.newsletter_unsent_drafts(text, uuid)', 'execute'),
  'signed-in users may not read drafts by token');
select ok(not has_function_privilege('anon', 'public.admin_newsletter_runs(integer)', 'execute'),
  'signed-out visitors may not list runs');

-- The workflow (anon, with the token) ------------------------------------------

set local role anon;

select throws_ok(
  $$ select * from public.newsletter_unsent_drafts('wrong', (select id from ids where name = 'weekly')) $$,
  '28000', null, 'a wrong token is refused'
);
select results_eq(
  $$ select channel, body, kind, issue_date
     from public.newsletter_unsent_drafts((select token from t), (select id from ids where name = 'weekly')) $$,
  $$ values ('linkedin'::text, 'For the editor'::text, 'weekly'::text, '2026-10-05'::date),
            ('x', 'For Chris', 'weekly', '2026-10-05') $$,
  'unsent drafts come with their run''s kind and issue date'
);
select lives_ok(
  $$ select public.newsletter_mark_drafts_emailed((select token from t),
       array[(select id from ids where name = 'linkedin')]) $$,
  'drafts are marked as emailed'
);
select results_eq(
  $$ select channel from public.newsletter_unsent_drafts((select token from t), (select id from ids where name = 'weekly')) $$,
  $$ values ('x'::text) $$,
  'emailed drafts are not sent again'
);

-- A reader ------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select throws_ok($$ select * from public.admin_newsletter_runs() $$, '42501', null,
  'readers cannot list runs');
select throws_ok($$ select * from public.admin_newsletter_drafts((select id from ids where name = 'weekly')) $$,
  '42501', null, 'readers cannot read drafts');
select throws_ok($$ select public.admin_newsletter_cost() $$, '42501', null,
  'readers cannot see costs');

-- An admin --------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select results_eq(
  $$ select kind, status, shortlisted, drafts from public.admin_newsletter_runs()
     where id in (select id from ids) $$,
  $$ values ('weekly'::text, 'succeeded'::text, 1, 2), ('daily', 'succeeded', 0, 0) $$,
  'runs, newest first, with what each produced'
);
select results_eq(
  $$ select rank, title, platform, reason from public.admin_newsletter_shortlist((select id from ids where name = 'weekly')) $$,
  $$ values (1, 'Legal Tutor'::text, 'xAI'::text, 'Pays well'::text) $$,
  'a run''s shortlist with job and platform'
);
select results_eq(
  $$ select channel, emailed_at is not null from public.admin_newsletter_drafts((select id from ids where name = 'weekly')) $$,
  $$ values ('linkedin'::text, true), ('x', false) $$,
  'a run''s drafts and whether each was emailed'
);
-- The seeded sample run (supabase/seed.sql) cost nothing.
select is(
  public.admin_newsletter_cost(),
  jsonb_build_object('last_7d', 0.5, 'last_30d', 2.5, 'this_month',
    (case when now() - interval '1 hour' >= date_trunc('month', now()) then 0.5 else 0 end)
    + (case when now() - interval '20 days' >= date_trunc('month', now()) then 2 else 0 end)),
  'spend over the last 7 and 30 days and this month'
);

select * from finish();
rollback;
