-- site_events: written only through log_site_event(), never read by the API
-- roles, and holding no personal data.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select columns_are(
  'public', 'site_events',
  array['id', 'event', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'at'],
  'site_events has no column that could identify a person'
);

set local role anon;
select lives_ok(
  $$ select public.log_site_event('newsletter_signup', 'footer', 'linkedin', 'social', '') $$,
  'signed-out visitors can record a signup'
);
select throws_ok(
  $$ select count(*) from public.site_events $$,
  '42501', null, 'signed-out visitors cannot read events'
);
select throws_ok(
  $$ insert into public.site_events (event, source) values ('newsletter_signup', 'job') $$,
  '42501', null, 'signed-out visitors cannot insert directly'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$ select public.log_site_event('newsletter_signup', 'dashboard') $$,
  'signed-in users can record a signup'
);
select throws_ok(
  $$ select count(*) from public.site_events $$,
  '42501', null, 'signed-in users cannot read events'
);
reset role;

select results_eq(
  $$ select source, utm_source, utm_medium, utm_campaign
     from public.site_events order by id $$,
  $$ values
       ('footer'::text, 'linkedin'::text, 'social'::text, null::text),
       ('dashboard', null, null, null) $$,
  'events are stored with their source, and empty tags become null'
);

select throws_ok(
  $$ select public.log_site_event('newsletter_signup', 'somewhere') $$,
  '23514', null, 'an unknown source is rejected'
);
select throws_ok(
  $$ select public.log_site_event('page_view', 'footer') $$,
  '23514', null, 'an unknown event is rejected'
);

select * from finish();
rollback;
