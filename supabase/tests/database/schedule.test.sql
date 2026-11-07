-- Ingestion schedule: cron jobs, the Vault token, URL setup and back-off.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- Schedule ---------------------------------------------------------------

select results_eq(
  $$ select jobname, schedule from cron.job where jobname like 'ingest-%' order by jobname $$,
  $$ values ('ingest-invisible'::text, '17 */6 * * *'::text),
            ('ingest-mercor', '7 */6 * * *'),
            ('ingest-micro1', '37 */6 * * *'),
            ('ingest-remoexperts', '57 */6 * * *'),
            ('ingest-welo-data', '27 */6 * * *'),
            ('ingest-xai', '47 */6 * * *') $$,
  'each platform runs every 6 hours, staggered'
);

-- Token ------------------------------------------------------------------

select ok(
  (select decrypted_secret ~ '^[0-9a-f]{64}$' from vault.decrypted_secrets where name = 'ingest_token'),
  'a random 256-bit token is stored in Vault'
);

select ok(
  public.verify_ingest_token(
    (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_token')
  ),
  'the stored token verifies'
);
select ok(not public.verify_ingest_token('wrong'), 'a wrong token does not');
select ok(not public.verify_ingest_token(null), 'a missing token does not');

-- URL and invocation -------------------------------------------------------

delete from vault.secrets where name = 'ingest_url';
select is(private.invoke_ingest('mercor'), null, 'runs are skipped until the URL is set');

select throws_ok(
  $$ select public.set_ingest_url('https://example.supabase.co/functions/v1') $$,
  'P0001', null, 'the URL must be a base URL'
);

select public.set_ingest_url('https://example.supabase.co');
select public.set_ingest_url('https://ref.supabase.co');
select is(
  (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_url'),
  'https://ref.supabase.co',
  'setting the URL again updates it'
);

select isnt(private.invoke_ingest('mercor'), null, 'a configured run is queued');
select is(
  (select url from net.http_request_queue order by id desc limit 1),
  'https://ref.supabase.co/functions/v1/ingest',
  'it calls the ingest function'
);
select is(
  (select headers ->> 'x-ingest-token' from net.http_request_queue order by id desc limit 1),
  (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_token'),
  'it sends the token'
);

-- Back-off -----------------------------------------------------------------

select public.ingest_jobs('micro1', now() - interval '3 hours', '[]', 0, 'HTTP 500');
select public.ingest_jobs('micro1', now() - interval '2 hours', '[]', 0, 'HTTP 500');
select ok(private.ingest_due('micro1'), 'two failures in a row: keep trying');

select public.ingest_jobs('micro1', now() - interval '1 hour', '[]', 0, 'HTTP 500');
select ok(not private.ingest_due('micro1'), 'three failures in a row: back off');
select is(private.invoke_ingest('micro1'), null, 'a backed-off run is skipped');

-- Access -------------------------------------------------------------------

set local role authenticated;
select throws_ok(
  $$ select public.verify_ingest_token('x') $$,
  '42501', null, 'users cannot probe the token'
);
reset role;

select * from finish();
rollback;
