-- Ingestion schedule: pg_cron calls the `ingest` Edge Function every 6 hours
-- per platform (staggered), through pg_net.
--
-- The call authenticates with a random token kept in Vault, created here, so
-- no key ever has to be copied by hand. The Edge Function checks it with
-- verify_ingest_token(). The functions base URL differs per environment and
-- is stored in Vault by the deploy workflow (set_ingest_url); until it is
-- set, scheduled runs are skipped.
--
-- Back-off: after 3 failed runs in a row a platform is tried once a day
-- until it succeeds again.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The shared secret between pg_cron and the Edge Function.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ingest_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ingest_token',
      'Authenticates scheduled calls to the ingest Edge Function'
    );
  end if;
end;
$$;

-- Functions base URL, e.g. https://<ref>.supabase.co. Service role only.
create function public.set_ingest_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url !~ '^https?://[^/]+$' then
    raise exception 'expected a base URL without a path, got %', p_url;
  end if;
  select id into v_id from vault.secrets where name = 'ingest_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'ingest_url', 'Base URL for the ingest Edge Function');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

revoke all on function public.set_ingest_url(text) from public, anon, authenticated;
grant execute on function public.set_ingest_url(text) to service_role;

-- Called by the Edge Function (with the service role) to check a token.
create function public.verify_ingest_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select decrypted_secret = p_token
     from vault.decrypted_secrets
     where name = 'ingest_token'),
    false
  )
$$;

revoke all on function public.verify_ingest_token(text) from public, anon, authenticated;
grant execute on function public.verify_ingest_token(text) to service_role;

-- Whether a scheduled run should go ahead: yes, unless the last 3 runs all
-- failed and the latest was less than a day ago.
create function private.ingest_due(p_platform text)
returns boolean
language sql
stable
set search_path = ''
as $$
  with recent as (
    select r.error, r.started_at
    from public.ingest_runs r
    join public.platforms p on p.id = r.platform_id
    where p.slug = p_platform
    order by r.started_at desc
    limit 3
  )
  select not (
    (select count(*) from recent where error is not null) = 3
    and (select max(started_at) from recent) > now() - interval '1 day'
  )
$$;

-- Fires one ingest run. Returns the pg_net request id, or null when skipped.
create function private.invoke_ingest(p_platform text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'ingest_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'ingest_token';

  if v_url is null or v_token is null then
    raise notice 'ingest not configured (ingest_url or ingest_token missing); skipping %', p_platform;
    return null;
  end if;

  if not private.ingest_due(p_platform) then
    raise notice 'ingest for % is backing off after repeated failures', p_platform;
    return null;
  end if;

  return net.http_post(
    url := v_url || '/functions/v1/ingest',
    body := jsonb_build_object('platform', p_platform),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-token', v_token
    ),
    -- A micro1 run pages with pauses; allow well over its ~15 s.
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function private.invoke_ingest(text) from public;
revoke all on function private.ingest_due(text) from public;

-- Every 6 hours, staggered so the platforms never run together.
select cron.schedule('ingest-mercor', '7 */6 * * *', $$select private.invoke_ingest('mercor')$$);
select cron.schedule('ingest-micro1', '37 */6 * * *', $$select private.invoke_ingest('micro1')$$);
