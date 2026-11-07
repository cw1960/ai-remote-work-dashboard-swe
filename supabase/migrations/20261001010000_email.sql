-- Email (Phase 4): the welcome email, daily follow-up reminders and
-- token-based unsubscribe.
--
-- Emails are rendered and sent by the Next.js app (React Email + Resend), so
-- they share its translations and brand config. Daily reminders: pg_cron
-- calls the app's /api/cron/reminders route through pg_net, with a random
-- token kept in Vault (like ingestion). The route reads the due reminders
-- through due_reminders(), which checks that token, so the app needs no
-- service role key. The app URL is stored in Vault by the deploy workflow
-- (set_app_url); until it is set, scheduled runs are skipped.

-- When the welcome email went out, and the last day a reminder was sent.
-- Not user-editable (the column grants on email_prefs stay as they are).
alter table public.email_prefs
  add column welcomed_at timestamptz,
  add column last_reminder_on date;

-- The shared secret between pg_cron and the app's cron route.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_token',
      'Authenticates scheduled calls to the app''s /api/cron routes'
    );
  end if;
end;
$$;

-- Whether a token is the cron token. Internal only.
create function private.is_cron_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select decrypted_secret = p_token
     from vault.decrypted_secrets
     where name = 'cron_token'),
    false
  )
$$;

revoke all on function private.is_cron_token(text) from public;

-- The app's public base URL, e.g. https://example.com. Service role only.
create function public.set_app_url(p_url text)
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
  select id into v_id from vault.secrets where name = 'app_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'app_url', 'Base URL of the web app, for scheduled calls');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

revoke all on function public.set_app_url(text) from public, anon, authenticated;
grant execute on function public.set_app_url(text) to service_role;

-- ---------------------------------------------------------------------------
-- Welcome email: claimed once per user, by the user, when onboarding ends.
-- Returns the address and locale to send to, or no row if already claimed.
-- ---------------------------------------------------------------------------
create function public.claim_welcome_email()
returns table (email text, locale text, unsubscribe_token text)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.email_prefs
    set welcomed_at = now()
    where user_id = auth.uid() and welcomed_at is null
    returning user_id, unsubscribe_token
  )
  select u.email::text, p.locale, c.unsubscribe_token
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.profiles p on p.user_id = c.user_id
  where u.email is not null
$$;

revoke all on function public.claim_welcome_email() from public, anon;
grant execute on function public.claim_welcome_email() to authenticated;

-- ---------------------------------------------------------------------------
-- Daily reminders: per user with reminders on and not yet reminded on
-- p_day, the cards whose follow-up day is p_day. Cron token required.
-- ---------------------------------------------------------------------------
create function public.due_reminders(p_token text, p_day date)
returns table (
  user_id uuid,
  email text,
  locale text,
  unsubscribe_token text,
  cards jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_cron_token(p_token) then
    raise exception 'invalid cron token' using errcode = '28000';
  end if;

  return query
  select
    c.user_id,
    u.email::text,
    p.locale,
    e.unsubscribe_token,
    jsonb_agg(
      jsonb_build_object(
        'title', c.title,
        'stage', c.stage,
        'platform', coalesce(jp.name, cp.name)
      )
      order by c.stage, c.position
    )
  from public.tracker_cards c
  join public.email_prefs e on e.user_id = c.user_id
  join public.profiles p on p.user_id = c.user_id
  join auth.users u on u.id = c.user_id
  left join public.jobs j on j.id = c.job_id
  left join public.platforms jp on jp.id = j.platform_id
  left join public.platforms cp on cp.id = c.platform_id
  where e.reminders_on
    and e.last_reminder_on is distinct from p_day
    and c.next_action_at >= p_day::timestamptz
    and c.next_action_at < (p_day + 1)::timestamptz
    and u.email is not null
  group by c.user_id, u.email, p.locale, e.unsubscribe_token;
end;
$$;

-- Token-gated, so the app can call it without the service role key.
revoke all on function public.due_reminders(text, date) from public;
grant execute on function public.due_reminders(text, date) to anon, service_role;

-- Records that a user's reminder for p_day went out. Cron token required.
create function public.mark_reminder_sent(p_token text, p_user_id uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_cron_token(p_token) then
    raise exception 'invalid cron token' using errcode = '28000';
  end if;
  update public.email_prefs
  set last_reminder_on = p_day
  where user_id = p_user_id;
end;
$$;

revoke all on function public.mark_reminder_sent(text, uuid, date) from public;
grant execute on function public.mark_reminder_sent(text, uuid, date) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Unsubscribe links: read and change one user's email preferences with the
-- unsubscribe token from an email, without signing in.
-- ---------------------------------------------------------------------------
create function public.email_prefs_by_token(p_token text)
returns table (alerts_on boolean, reminders_on boolean, recap_on boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.alerts_on, e.reminders_on, e.recap_on
  from public.email_prefs e
  where p_token ~ '^[a-z0-9]{32}$' and e.unsubscribe_token = p_token
$$;

-- Null leaves a preference unchanged. Returns false for an unknown token.
create function public.set_email_prefs_by_token(
  p_token text,
  p_alerts_on boolean default null,
  p_reminders_on boolean default null,
  p_recap_on boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[a-z0-9]{32}$' then
    return false;
  end if;
  update public.email_prefs
  set alerts_on = coalesce(p_alerts_on, alerts_on),
      reminders_on = coalesce(p_reminders_on, reminders_on),
      recap_on = coalesce(p_recap_on, recap_on)
  where unsubscribe_token = p_token;
  return found;
end;
$$;

revoke all on function public.email_prefs_by_token(text) from public;
revoke all on function public.set_email_prefs_by_token(text, boolean, boolean, boolean) from public;
grant execute on function public.email_prefs_by_token(text) to anon, authenticated;
grant execute on function public.set_email_prefs_by_token(text, boolean, boolean, boolean)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: once a day at 13:00 UTC (morning in the Americas, afternoon in
-- Europe and Africa, evening in Asia).
-- ---------------------------------------------------------------------------
create function private.invoke_reminders()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'cron_token';

  if v_url is null or v_token is null then
    raise notice 'reminders not configured (app_url or cron_token missing); skipping';
    return null;
  end if;

  return net.http_post(
    url := v_url || '/api/cron/reminders',
    body := jsonb_build_object('day', (now() at time zone 'utc')::date),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.invoke_reminders() from public;

select cron.schedule('email-reminders', '0 13 * * *', $$select private.invoke_reminders()$$);
