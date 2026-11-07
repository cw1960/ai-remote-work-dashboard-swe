-- Newsletter pivot P2: the Listener's tables are admin-only, token-gated,
-- store no usernames and keep 90 days.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to anon;

create temporary table r (id uuid) on commit drop;
grant select, insert on r to anon;

-- A listen from 100 days ago, to be cleaned up by the next save.
insert into public.listen_runs (window_start, window_end, created_at)
values (now() - interval '101 days', now() - interval '100 days', now() - interval '100 days');

select hasnt_column('public', 'listen_comments', 'author', 'comments store no author');
select hasnt_column('public', 'listen_threads', 'author', 'threads store no author');
select ok(not has_function_privilege('authenticated',
  'public.newsletter_save_listen(text, timestamptz, timestamptz, jsonb)', 'execute'),
  'signed-in users may not save listens');
select ok(not has_function_privilege('authenticated',
  'public.newsletter_listen(text, uuid, integer)', 'execute'),
  'signed-in users may not read listens');

set local role anon;

select throws_ok(
  $$ select public.newsletter_save_listen('wrong', now() - interval '1 day', now(), '[]') $$,
  '28000', null, 'a wrong token is refused'
);
select throws_ok($$ select * from public.listen_threads $$, '42501', null,
  'anon cannot read threads directly');
select throws_ok($$ select * from public.listen_comments $$, '42501', null,
  'anon cannot read comments directly');

insert into r select public.newsletter_save_listen((select token from t),
  now() - interval '1 day', now(),
  '[{"reddit_id": "1xnrvcr", "subreddit": "technology",
     "title": "10 States With Data Centers on the Ballot All Voted to Ban Them",
     "excerpt": "", "url": "https://www.reddit.com/r/technology/comments/1xnrvcr/x/",
     "score": 7413, "num_comments": 113, "upvote_ratio": 0.94,
     "posted_at": "2026-11-04T10:00:00Z", "heat": 50, "division": 0.1,
     "comments": [
       {"reddit_id": "c1", "body": "Surveillance Centers", "score": 22, "posted_at": "2026-11-04T11:00:00Z"},
       {"reddit_id": "c2", "body": "GOOD", "score": 6, "posted_at": "2026-11-04T11:05:00Z"},
       {"reddit_id": "c1", "body": "duplicate", "score": 1, "posted_at": "2026-11-04T11:06:00Z"}]},
    {"reddit_id": "1xn5g1f", "subreddit": "singularity",
     "title": "Robots", "url": "https://www.reddit.com/r/singularity/comments/1xn5g1f/x/",
     "score": 1698, "num_comments": 484, "upvote_ratio": null,
     "posted_at": "2026-11-04T09:00:00Z", "heat": 80, "division": 0.4}]');

select is(
  (select jsonb_agg(x ->> 'reddit_id') from jsonb_array_elements(
     public.newsletter_listen((select token from t), (select id from r))) x),
  '["1xn5g1f", "1xnrvcr"]'::jsonb,
  'threads come back hottest first'
);
select is(
  (select public.newsletter_listen((select token from t), (select id from r)) -> 1 -> 'comments'),
  '[{"reddit_id": "c1", "body": "Surveillance Centers", "score": 22, "posted_at": "2026-11-04T11:00:00+00:00"},
    {"reddit_id": "c2", "body": "GOOD", "score": 6, "posted_at": "2026-11-04T11:05:00+00:00"}]'::jsonb,
  'comments by score, duplicates dropped'
);
select throws_ok(
  $$ select public.newsletter_save_listen((select token from t), now() - interval '1 day', now(),
       '[{"reddit_id": "a1", "subreddit": "x", "title": "t", "url": "https://evil.example/r/x",
          "score": 1, "num_comments": 0, "posted_at": "2026-11-04T09:00:00Z"}]') $$,
  '23514', null, 'a link that is not a Reddit thread is refused'
);
select throws_ok(
  $$ select public.newsletter_save_listen((select token from t), now() - interval '1 day', now(), '{}') $$,
  '22023', null, 'threads must be an array'
);

reset role;

select is((select threads from public.listen_runs where id = (select id from r)), 2,
  'the run counts its threads');
select is((select comments from public.listen_runs where id = (select id from r)), 2,
  'the run counts its comments');
select is(
  (select count(*)::int from public.listen_runs where created_at < now() - interval '90 days'),
  0, 'listens older than 90 days are removed'
);

select * from finish();
rollback;
