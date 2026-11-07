-- Newsletter pivot P3: stories, facts with sources, and quotes that can only
-- be stored comments; token-gated and admin-only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to anon;

create temporary table r (id uuid) on commit drop;
grant select, insert on r to anon;

select ok(not has_function_privilege('authenticated',
  'public.newsletter_save_stories(text, uuid, jsonb)', 'execute'),
  'signed-in users may not save stories');

set local role anon;

insert into r select public.newsletter_save_listen((select token from t),
  now() - interval '1 day', now(),
  '[{"reddit_id": "t1", "subreddit": "technology", "title": "Data centers lose",
     "url": "https://www.reddit.com/r/technology/comments/t1/x/", "score": 100,
     "num_comments": 50, "posted_at": "2026-11-04T10:00:00Z", "heat": 50,
     "comments": [{"reddit_id": "c1", "body": "Surveillance Centers", "score": 22, "posted_at": "2026-11-04T11:00:00Z"}]},
    {"reddit_id": "t2", "subreddit": "accelerate", "title": "We lose the race",
     "url": "https://www.reddit.com/r/accelerate/comments/t2/x/", "score": 10,
     "num_comments": 20, "posted_at": "2026-11-04T10:00:00Z", "heat": 20,
     "comments": [{"reddit_id": "c2", "body": "We are going to lose the AI race.", "score": 5, "posted_at": "2026-11-04T11:00:00Z"}]}]');

select is(public.newsletter_latest_listen((select token from t)), (select id from r),
  'the latest listen is found');
select throws_ok($$ select public.newsletter_latest_listen('wrong') $$, '28000', null,
  'a wrong token is refused');

select is(public.newsletter_save_stories((select token from t), (select id from r),
  '[{"claim": "Voters rejected data centers", "status": "confirmed", "heat": 70,
     "division": 0.4, "spread": 2, "communities": ["technology", "accelerate"],
     "threads": ["t1", "t2"],
     "facts": [{"statement": "38 of 41 measures favored bans or pauses.",
                "sources": [{"url": "https://www.fastcompany.com/x", "title": "Fast Company",
                             "cited_text": "38 out of 41 ballot measures favored banning"}]}],
     "quotes": [{"thread": "t1", "comment": "c1", "side": "skeptic"},
                {"thread": "t2", "comment": "c2", "side": "accelerationist"}]},
    {"claim": "Robots worked an 8-hour shift", "status": "false",
     "correction": "Reported trials ran about three hours.", "threads": ["t1"]}]'),
  2, 'two stories saved');

select is(
  (select jsonb_agg(s -> 'status') from jsonb_array_elements(
     public.newsletter_stories((select token from t), (select id from r))) s),
  '["confirmed", "false"]'::jsonb, 'stories come back in rank order');
select is(
  public.newsletter_stories((select token from t), (select id from r)) -> 0 -> 'facts' -> 0 -> 'sources' -> 0 ->> 'cited_text',
  '38 out of 41 ballot measures favored banning', 'a fact carries its cited passage');
select is(
  (select jsonb_agg(q ->> 'body' order by q ->> 'body') from jsonb_array_elements(
     public.newsletter_stories((select token from t), (select id from r)) -> 0 -> 'quotes') q),
  '["Surveillance Centers", "We are going to lose the AI race."]'::jsonb,
  'quotes come back verbatim from the stored comments');

select throws_ok(
  $$ select public.newsletter_save_stories((select token from t), (select id from r),
       '[{"claim": "x", "status": "confirmed", "threads": ["t1"], "facts": []}]') $$,
  '22023', null, 'a confirmed story needs a sourced fact');
select throws_ok(
  $$ select public.newsletter_save_stories((select token from t), (select id from r),
       '[{"claim": "x", "status": "unconfirmed", "threads": ["t1"],
          "facts": [{"statement": "s", "sources": []}]}]') $$,
  '22023', null, 'every fact needs a source');
select throws_ok(
  $$ select public.newsletter_save_stories((select token from t), (select id from r),
       '[{"claim": "x", "status": "unconfirmed", "threads": ["nope"]}]') $$,
  '22023', null, 'a thread outside the listen is refused');
select throws_ok(
  $$ select public.newsletter_save_stories((select token from t), (select id from r),
       '[{"claim": "x", "status": "unconfirmed", "threads": ["t1"],
          "quotes": [{"thread": "t2", "comment": "c2", "side": "a"}]}]') $$,
  '22023', null, 'a quote must come from one of the story''s threads');
select throws_ok($$ select * from public.story_quotes $$, '42501', null,
  'anon cannot read quotes directly');

reset role;

select is((select count(*)::int from public.listen_stories where listen_run_id = (select id from r)), 2,
  'a refused save leaves the earlier stories in place');

set local role anon;

select throws_ok(
  $$ select public.newsletter_save_stories((select token from t), (select id from r),
       '[{"claim": "x", "status": "partly_true", "threads": ["t1"], "facts": []}]') $$,
  '22023', null, 'a partly true story needs a sourced fact');
select throws_ok(
  $$ select public.newsletter_save_stories((select token from t), (select id from r),
       '[{"claim": "x", "status": "partly_true", "threads": ["t1"],
          "facts": [{"statement": "s", "sources": [{"url": "https://example.com/a", "cited_text": "s"}]}]}]') $$,
  '22023', null, 'a partly true story needs a correction');
select is(public.newsletter_save_stories((select token from t), (select id from r),
  '[{"claim": "Project Meridian is under investigation", "status": "partly_true",
     "correction": "A lawsuit was filed; no investigation is confirmed.",
     "threads": ["t1"],
     "facts": [{"statement": "A lawsuit was filed.",
                "sources": [{"url": "https://example.com/a", "cited_text": "filed a lawsuit"}]}]}]'),
  1, 'a partly true story with a fact and a correction is saved');
select is(
  public.newsletter_stories((select token from t), (select id from r)) -> 0 ->> 'status',
  'partly_true', 'a partly true story keeps its status');

select * from finish();
rollback;
