-- Newsletter social posts: scheduling, claiming due posts, recording results.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- Fixtures (as postgres) ---------------------------------------------------

create temporary table ids (name text, id uuid) on commit drop;

with run as (
  insert into public.newsletter_runs (kind, issue_date)
  values ('social', '2026-10-16')
  returning id
)
insert into ids select 'run', id from run;

grant select on ids to anon, authenticated;

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to anon;

create temporary table claimed (id uuid, channel text, body text) on commit drop;
grant select, insert on claimed to anon;

select ok(not has_function_privilege('authenticated',
  'public.newsletter_claim_due_posts(text, text[], integer)', 'execute'),
  'signed-in users may not claim posts');
select ok(not has_function_privilege('authenticated',
  'public.newsletter_finish_post(text, uuid, boolean, text, text, jsonb)', 'execute'),
  'signed-in users may not record post results');

-- The workflow (anon, with the token) ------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.newsletter_start_run((select token from t), 'social', '2026-10-16') $$,
  '23505', null, 'a second social run for the same day is refused'
);

select throws_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from ids where name = 'run'),
       jsonb_build_array(jsonb_build_object('channel', 'reddit', 'title', 'T', 'body', 'B',
         'scheduled_for', now()))) $$,
  '23514', null, 'Reddit drafts cannot be scheduled'
);

select lives_ok(
  $$ select public.newsletter_save_drafts((select token from t), (select id from ids where name = 'run'),
       jsonb_build_array(
         jsonb_build_object('channel', 'bluesky', 'body', 'Due now',
           'scheduled_for', now() - interval '10 minutes'),
         jsonb_build_object('channel', 'x', 'body', 'Later',
           'scheduled_for', now() + interval '2 hours'),
         jsonb_build_object('channel', 'bluesky', 'body', 'Far too late',
           'scheduled_for', now() - interval '4 hours'),
         jsonb_build_object('channel', 'reddit', 'title', 'Today''s roles', 'body', 'Roles in full'))) $$,
  'posts are saved with their times, Reddit as a draft'
);

select results_eq(
  $$ select channel, title, scheduled_for is not null
     from public.newsletter_unsent_drafts((select token from t), (select id from ids where name = 'run')) $$,
  $$ values ('bluesky'::text, null::text, true), ('bluesky', null, true), ('x', null, true),
            ('reddit', 'Today''s roles', false) $$,
  'the draft email lists posts by time, then Reddit drafts with their titles'
);

select throws_ok(
  $$ select * from public.newsletter_claim_due_posts('wrong', array['bluesky']) $$,
  '28000', null, 'a wrong token is refused'
);

select lives_ok(
  $$ insert into claimed
     select id, channel, body
     from public.newsletter_claim_due_posts((select token from t), array['bluesky', 'x']) $$,
  'due posts are claimed'
);
select results_eq(
  $$ select channel, body from claimed $$,
  $$ values ('bluesky'::text, 'Due now'::text) $$,
  'only due posts are claimed; a post more than 3 hours late is not'
);

select is_empty(
  $$ select * from public.newsletter_claim_due_posts((select token from t), array['bluesky', 'x']) $$,
  'a claimed post is never claimed twice'
);

select lives_ok(
  $$ select public.newsletter_finish_post((select token from t), (select id from claimed),
       true, 'https://bsky.app/profile/airemoteworktoday.bsky.social/post/abc') $$,
  'a posted result is recorded'
);
select throws_ok(
  $$ select public.newsletter_finish_post((select token from t), (select id from claimed), true) $$,
  '22023', null, 'a post can be finished only once'
);

-- A failed post (the X post made due by hand) --------------------------------------

reset role;
update public.social_drafts set scheduled_for = now() - interval '1 minute'
where body = 'Later';
delete from claimed;
set local role anon;

select lives_ok(
  $$ insert into claimed
     select id, channel, body
     from public.newsletter_claim_due_posts((select token from t), array['x']) $$,
  'a post made due later is claimed'
);
select lives_ok(
  $$ select public.newsletter_finish_post((select token from t), (select id from claimed),
       false, null, 'HTTP 403 from X') $$,
  'a failed result is recorded'
);

-- Results (as postgres) ----------------------------------------------------------

reset role;

select results_eq(
  $$ select body, status, post_url is not null, post_error
     from public.social_drafts
     where run_id = (select id from ids where name = 'run')
     order by body $$,
  $$ values ('Due now'::text, 'posted'::text, true, null::text),
            ('Far too late', 'skipped', false, 'More than 3 hours late; not posted.'),
            ('Later', 'failed', false, 'HTTP 403 from X'),
            ('Roles in full', 'draft', false, null) $$,
  'each post ends posted, skipped, failed or still a draft'
);

select * from finish();
rollback;
