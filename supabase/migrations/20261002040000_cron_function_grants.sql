-- The cron-only email functions are token-gated, but Supabase's default
-- privileges also let signed-in users call them. Only the cron route (anon
-- with the token) and service_role need them.

revoke execute on function public.due_reminders(text, date) from authenticated;
revoke execute on function public.mark_reminder_sent(text, uuid, date) from authenticated;
revoke execute on function public.due_job_alerts(text, timestamptz) from authenticated;
revoke execute on function public.mark_job_alerts_sent(text, uuid[], timestamptz) from authenticated;
