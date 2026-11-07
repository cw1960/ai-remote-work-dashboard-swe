-- Cron-only email functions: the cron route (anon, with the token) may call
-- them; signed-in users may not.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select ok(has_function_privilege('anon', 'public.due_reminders(text, date)', 'execute'), 'anon: due_reminders');
select ok(has_function_privilege('anon', 'public.mark_reminder_sent(text, uuid, date)', 'execute'), 'anon: mark_reminder_sent');
select ok(has_function_privilege('anon', 'public.due_job_alerts(text, timestamptz)', 'execute'), 'anon: due_job_alerts');
select ok(has_function_privilege('anon', 'public.mark_job_alerts_sent(text, uuid[], timestamptz)', 'execute'), 'anon: mark_job_alerts_sent');

select ok(not has_function_privilege('authenticated', 'public.due_reminders(text, date)', 'execute'), 'not authenticated: due_reminders');
select ok(not has_function_privilege('authenticated', 'public.mark_reminder_sent(text, uuid, date)', 'execute'), 'not authenticated: mark_reminder_sent');
select ok(not has_function_privilege('authenticated', 'public.due_job_alerts(text, timestamptz)', 'execute'), 'not authenticated: due_job_alerts');
select ok(not has_function_privilege('authenticated', 'public.mark_job_alerts_sent(text, uuid[], timestamptz)', 'execute'), 'not authenticated: mark_job_alerts_sent');

select * from finish();
rollback;
