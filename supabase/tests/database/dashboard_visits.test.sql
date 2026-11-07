-- dashboard_visit: visits an hour apart, the caller's own row only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com');

set local role anon;
select throws_ok(
  $$ select public.dashboard_visit() $$,
  '42501', null, 'signed-out visitors cannot record a visit'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is(public.dashboard_visit(), null, 'the first visit has no previous one');
select is(public.dashboard_visit(), null, 'a refresh in the same visit changes nothing');

reset role;
update public.profiles
set last_dashboard_at = '2026-10-01T08:00:00Z'
where user_id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;

select is(
  public.dashboard_visit(), '2026-10-01T08:00:00Z'::timestamptz,
  'a later visit returns when the last one was'
);
select is(
  public.dashboard_visit(), '2026-10-01T08:00:00Z'::timestamptz,
  'and keeps returning it while the visit lasts'
);

reset role;
select is(
  (select last_dashboard_at from public.profiles
   where user_id = '00000000-0000-0000-0000-0000000000b1'),
  null, 'other users are untouched'
);

select * from finish();
rollback;
