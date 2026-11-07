-- Schema behaviour: tables, seed, constraints and triggers.
-- Access rules (RLS policies) are tested separately.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Tables and seed ------------------------------------------------------------

select tables_are(
  'public',
  array[
    'platforms', 'playbooks', 'jobs', 'ingest_runs', 'profiles',
    'platform_memberships', 'tracker_cards', 'card_events', 'saved_searches',
    'email_prefs', 'inbound_emails', 'outbound_clicks', 'site_events',
    'newsletter_runs', 'job_shortlists', 'social_drafts',
    'master_resumes', 'tailored_resumes', 'resume_generations',
    'job_descriptions', 'listen_runs', 'listen_threads', 'listen_comments',
    'listen_stories', 'listen_story_threads', 'story_facts', 'story_sources',
    'story_quotes', 'prophet_uses'
  ],
  'public schema has the twelve V1 tables, site_events, the newsletter workflow, listen and story tables, the resume tables and job descriptions'
);

select is(
  (select count(*)::int from public.platforms),
  15,
  'the fifteen platforms are seeded'
);

select is(
  (select count(*)::int from public.platforms
   where strpos(referral_url_template, '{external_id}') = 0),
  0,
  'every referral template has the job id placeholder'
);

select is(
  has_schema_privilege('anon', 'private', 'usage')
    or has_schema_privilege('authenticated', 'private', 'usage'),
  false,
  'API roles cannot reach the private schema'
);

-- Fixtures ---------------------------------------------------------------

insert into public.jobs (id, platform_id, external_id, title, url, languages, countries)
select '00000000-0000-0000-0000-00000000a001', id, 'ext-1', 'Spanish legal expert',
       'https://example.com/jobs/1', '{es}', '{MX,US}'
from public.platforms where slug = 'mercor';

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com', '{"locale":"es"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com', '{"locale":"not a locale"}');

-- Jobs constraints ----------------------------------------------------------

select throws_ok(
  $$
    insert into public.jobs (platform_id, external_id, title, url, countries)
    select id, 'bad-country', 't', 'https://example.com', '{mx}'
    from public.platforms where slug = 'mercor'
  $$,
  '23514',
  null,
  'country codes must be upper-case ISO 3166 alpha-2'
);

select throws_ok(
  $$
    insert into public.jobs (platform_id, external_id, title, url, languages)
    select id, 'bad-language', 't', 'https://example.com', '{spa}'
    from public.platforms where slug = 'mercor'
  $$,
  '23514',
  null,
  'language codes must be ISO 639-1'
);

select throws_ok(
  $$
    insert into public.jobs (platform_id, external_id, title, url, pay_min, pay_max)
    select id, 'bad-pay', 't', 'https://example.com', 90, 40
    from public.platforms where slug = 'mercor'
  $$,
  '23514',
  null,
  'pay_min cannot exceed pay_max'
);

select throws_ok(
  $$
    insert into public.jobs (platform_id, external_id, title, url)
    select id, 'ext-1', 'duplicate', 'https://example.com'
    from public.platforms where slug = 'mercor'
  $$,
  '23505',
  null,
  'external_id is unique per platform'
);

select throws_ok(
  $$ update public.jobs set status = 'closed' where external_id = 'ext-1' $$,
  '23514',
  null,
  'a closed job must have closed_at'
);

select throws_ok(
  $$
    insert into public.jobs (platform_id, external_id, title, url)
    select id, 'http', 't', 'http://example.com'
    from public.platforms where slug = 'mercor'
  $$,
  '23514',
  null,
  'job URLs must be https'
);

-- Sign-up trigger -----------------------------------------------------------

select is(
  (select locale from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'es',
  'sign-up creates a profile with the requested locale'
);

select is(
  (select locale from public.profiles where user_id = '00000000-0000-0000-0000-0000000000b1'),
  'en',
  'an invalid requested locale falls back to en'
);

select ok(
  (select inbound_token ~ '^[a-z0-9]{32}$' and unsubscribe_token ~ '^[a-z0-9]{32}$'
           and inbound_token <> unsubscribe_token
   from public.email_prefs where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'sign-up creates email prefs with two distinct random tokens'
);

select isnt(
  (select inbound_token from public.email_prefs where user_id = '00000000-0000-0000-0000-0000000000a1'),
  (select inbound_token from public.email_prefs where user_id = '00000000-0000-0000-0000-0000000000b1'),
  'inbound tokens differ between users'
);

-- Tracker cards and stage history -------------------------------------------

select throws_ok(
  $$
    insert into public.tracker_cards (user_id, kind, title)
    values ('00000000-0000-0000-0000-0000000000a1', 'job', 'no job id')
  $$,
  '23514',
  null,
  'a job card needs a job'
);

insert into public.tracker_cards (id, user_id, kind, job_id, title)
values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1',
        'job', '00000000-0000-0000-0000-00000000a001', 'Spanish legal expert');

select results_eq(
  $$ select from_stage, to_stage, source::text from public.card_events
     where card_id = '00000000-0000-0000-0000-00000000c001' $$,
  $$ values (null::public.card_stage, 'saved'::public.card_stage, 'user') $$,
  'creating a card records its first stage'
);

update public.tracker_cards set notes = 'hi'
where id = '00000000-0000-0000-0000-00000000c001';

select is(
  (select count(*)::int from public.card_events
   where card_id = '00000000-0000-0000-0000-00000000c001'),
  1,
  'edits that keep the stage write no event'
);

update public.tracker_cards set stage = 'applied'
where id = '00000000-0000-0000-0000-00000000c001';

set local app.card_event_source = 'email';
update public.tracker_cards set stage = 'interviewing'
where id = '00000000-0000-0000-0000-00000000c001';
reset app.card_event_source;

select results_eq(
  $$ select from_stage::text, to_stage::text, source::text, user_id from public.card_events
     where card_id = '00000000-0000-0000-0000-00000000c001' and from_stage is not null
     order by id $$,
  $$ values ('saved', 'applied', 'user', '00000000-0000-0000-0000-0000000000a1'::uuid),
            ('applied', 'interviewing', 'email', '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'stage changes are recorded with their source and owner'
);

-- Outbound clicks ------------------------------------------------------------

-- Start without a referral link (production has one for Mercor).
update public.platforms set referral_url_template = null where slug = 'mercor';

select is(
  public.log_outbound_click('00000000-0000-0000-0000-00000000a001'),
  false,
  'no referral is used when the platform has no template'
);

update public.platforms
set referral_url_template = 'https://example.com/r'
where slug = 'mercor';

select is(
  public.log_outbound_click('00000000-0000-0000-0000-00000000a001'),
  true,
  'a referral is used when the platform has a template'
);

select results_eq(
  $$ select referrer_used from public.outbound_clicks
     where job_id = '00000000-0000-0000-0000-00000000a001' order by id $$,
  $$ values (false), (true) $$,
  'each click is logged with whether a referral was used'
);

select throws_ok(
  $$ select public.log_outbound_click('00000000-0000-0000-0000-00000000ffff') $$,
  'P0002',
  null,
  'clicking an unknown job raises'
);

select * from finish();
rollback;
