-- Newsletter social P8: threads, images, polls, and the pg_cron schedule.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixtures (as postgres) ---------------------------------------------------

create temporary table ids (name text, id uuid) on commit drop;

with run as (
  insert into public.newsletter_runs (kind, issue_date)
  values ('social', '2026-11-06')
  returning id
)
insert into ids select 'run', id from run;
insert into ids values
  ('root', gen_random_uuid()), ('reply', gen_random_uuid()),
  ('other', gen_random_uuid()), ('orphan', gen_random_uuid());

grant select on ids to anon;

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to anon;

create temporary table claimed (id uuid, body text, reply_to_ref jsonb) on commit drop;
grant select, insert, delete on claimed to anon;

select ok(not has_function_privilege('anon',
  'private.invoke_social_posts(text)', 'execute'),
  'the workflow cannot start itself');
select ok(
  (select count(*) = 1 from cron.job where jobname = 'social-draft')
  and not exists (
    select 1 from cron.job
    where jobname in ('social-publish-day', 'social-publish-night')
  ),
  'pg_cron drafts the social posts and no longer publishes them (drafts only)');

-- The workflow (anon, with the token) ------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from ids where name = 'run'),
       jsonb_build_array(jsonb_build_object('channel', 'x', 'body', 'Orphan',
         'scheduled_for', now(), 'reply_to', (select id from ids where name = 'orphan')))) $$,
  '22023', null, 'a reply must follow a post of the same run'
);

select throws_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from ids where name = 'run'),
       jsonb_build_array(jsonb_build_object('channel', 'bluesky', 'body', 'Poll?',
         'scheduled_for', now(), 'poll_options', jsonb_build_array('Yes', 'No'),
         'poll_minutes', 1440))) $$,
  '23514', null, 'only X posts can carry a poll'
);

select throws_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from ids where name = 'run'),
       jsonb_build_array(jsonb_build_object('channel', 'x', 'body', 'Poll?',
         'scheduled_for', now(), 'poll_options',
         jsonb_build_array('Yes', 'An option much longer than X allows'), 'poll_minutes', 1440))) $$,
  '22023', null, 'poll options fit X''s 25 characters'
);

select throws_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from ids where name = 'run'),
       jsonb_build_array(jsonb_build_object('channel', 'x', 'body', 'Picture',
         'scheduled_for', now(), 'image_url', 'https://example.com/a.png'))) $$,
  '23514', null, 'an image needs its alt text'
);

select lives_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from ids where name = 'run'),
       jsonb_build_array(
         jsonb_build_object('id', (select id from ids where name = 'root'), 'channel', 'x',
           'body', 'The Fuse', 'kind', 'fuse_thread', 'scheduled_for', now() - interval '5 minutes',
           'image_url', 'https://example.com/fuse.png', 'image_alt', 'A marble head'),
         jsonb_build_object('id', (select id from ids where name = 'reply'), 'channel', 'x',
           'body', 'And then', 'kind', 'fuse_thread', 'scheduled_for', now() - interval '4 minutes',
           'reply_to', (select id from ids where name = 'root')),
         jsonb_build_object('id', (select id from ids where name = 'other'), 'channel', 'bluesky',
           'body', 'Bluesky root', 'scheduled_for', now() - interval '5 minutes'),
         jsonb_build_object('channel', 'bluesky', 'body', 'Bluesky reply',
           'scheduled_for', now() - interval '4 minutes',
           'reply_to', (select id from ids where name = 'other')),
         jsonb_build_object('channel', 'x', 'body', 'Yes or no?', 'kind', 'unanswerable',
           'scheduled_for', now() + interval '6 hours',
           'poll_options', jsonb_build_array('Yes', 'No', 'Wrong question'),
           'poll_minutes', 1440))) $$,
  'a thread, an image and a poll are saved'
);

select lives_ok(
  $$ insert into claimed select id, body, reply_to_ref
     from public.newsletter_claim_due_posts((select token from t), array['x', 'bluesky']) $$,
  'due posts are claimed'
);
select results_eq(
  $$ select body from claimed order by body $$,
  $$ values ('Bluesky root'::text), ('The Fuse'::text) $$,
  'a reply waits until the post it answers is up'
);

select lives_ok(
  $$ select public.newsletter_finish_post((select token from t), (select id from ids where name = 'root'),
       true, 'https://x.com/i/status/1', null, '{"id": "1"}'::jsonb) $$,
  'a posted post records its platform ids'
);
select lives_ok(
  $$ select public.newsletter_finish_post((select token from t), (select id from ids where name = 'other'),
       false, null, 'Bluesky was down') $$,
  'a failed post is recorded'
);

delete from claimed;
select lives_ok(
  $$ insert into claimed select id, body, reply_to_ref
     from public.newsletter_claim_due_posts((select token from t), array['x', 'bluesky']) $$,
  'replies are claimed next'
);
select results_eq(
  $$ select body, reply_to_ref from claimed $$,
  $$ values ('And then'::text, '{"id": "1"}'::jsonb) $$,
  'the reply gets the ids of the post it answers; the failed post''s reply is not claimed'
);

reset role;

select is(
  (select status from public.social_drafts where body = 'Bluesky reply'),
  'skipped',
  'a reply to a post that failed is skipped'
);

select * from finish();
rollback;
