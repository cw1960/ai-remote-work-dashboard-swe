-- Newsletter pivot P6 (owner, 2026-11-04): the issue on time, every day.
--
-- The owner wants each issue built and in their inbox before 07:00
-- Monterrey (UTC-6, no daylight saving) on the day it is published, then
-- prepares it in Beehiiv. GitHub's own schedule started the newsletter's
-- runs 2 to 5 hours late through October and November, so pg_cron starts
-- the newsletter repo's Listen workflow instead, at 04:02 Monterrey
-- (10:02 UTC): Listen, Verify and the Issue take about 30 minutes, so the
-- draft is ready around 04:30, leaving time to re-run by hand.
--
-- It calls GitHub's "Create a workflow dispatch event" API with a
-- fine-grained token the owner creates (Actions: read and write on
-- cw1960/airemoteworktoday only) and stores in Vault as
-- `github_dispatch_token`. Without the token it does nothing and the
-- workflow's own (late) schedule is the fallback.

create function private.invoke_newsletter_issue()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'github_dispatch_token';
  if v_token is null or v_token = '' then
    raise notice 'newsletter issue not started: github_dispatch_token missing';
    return null;
  end if;
  return net.http_post(
    url := 'https://api.github.com/repos/cw1960/airemoteworktoday/actions/workflows/listen.yml/dispatches',
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object('dry_run', 'false', 'trigger', 'pg_cron')
    ),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || v_token,
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'AIRemoteWorkDashboard-pg_cron',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.invoke_newsletter_issue() from public;

select cron.schedule('newsletter-issue', '2 10 * * *', $$select private.invoke_newsletter_issue()$$);
