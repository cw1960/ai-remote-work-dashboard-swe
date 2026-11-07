-- Prophets & Heretics (P9): which library quote each issue used.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to anon;

select ok(not has_table_privilege('anon', 'public.prophet_uses', 'select'),
  'the API cannot read the table directly');
select ok(not has_function_privilege('authenticated',
  'public.newsletter_record_prophet(text, date, text, text)', 'execute'),
  'signed-in users may not record uses');

set local role anon;

select throws_ok(
  $$ select public.newsletter_record_prophet('wrong', '2026-11-07', 'huxley-1961-made-for-technology', 'Aldous Huxley') $$,
  '28000', null, 'a wrong token is refused'
);

select lives_ok(
  $$ select public.newsletter_record_prophet((select token from t), '2026-11-07', 'huxley-1961-made-for-technology', 'Aldous Huxley') $$,
  'a use is recorded'
);
select lives_ok(
  $$ select public.newsletter_record_prophet((select token from t), '2026-11-07', 'arendt-1958-laborers-without-labor', 'Hannah Arendt') $$,
  'a re-run for the same day replaces it'
);
select results_eq(
  $$ select quote_id, thinker from public.newsletter_prophet_uses((select token from t), '2026-11-01') $$,
  $$ values ('arendt-1958-laborers-without-labor'::text, 'Hannah Arendt'::text) $$,
  'the rotation reads one use per day'
);
select throws_ok(
  $$ select public.newsletter_record_prophet((select token from t), '2026-11-08', 'Not An Id!', 'X') $$,
  '23514', null, 'quote ids are checked'
);

select * from finish();
rollback;
