-- Newsletter pivot P6: pg_cron starts the issue's workflow every morning.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select is(
  (select schedule from cron.job where jobname = 'newsletter-issue'),
  '2 10 * * *',
  'the issue starts at 04:02 Monterrey (10:02 UTC) every day');
select ok(not has_function_privilege('anon', 'private.invoke_newsletter_issue()', 'execute'),
  'anon may not start it');
select ok(not has_function_privilege('authenticated', 'private.invoke_newsletter_issue()', 'execute'),
  'signed-in users may not start it');

delete from vault.secrets where name = 'github_dispatch_token';
select is(private.invoke_newsletter_issue(), null,
  'without the GitHub token it does nothing');

select * from finish();
rollback;
