-- Access rules for the Data API roles (anon = signed out, authenticated =
-- signed in). The service role bypasses RLS and keeps full access.
--
-- Two layers:
--   1. Table and column privileges: start from nothing, then grant exactly
--      what each role needs. This also removes TRUNCATE, which RLS does not
--      cover, and stops users from editing columns such as tokens or owners.
--   2. RLS policies: which rows a role may see or change.

-- ---------------------------------------------------------------------------
-- 1. Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Public catalogue: read-only for everyone.
grant select on public.platforms, public.playbooks, public.jobs
  to anon, authenticated;

-- Owner tables: signed-in users only.
grant select, update (
  display_name, country, languages, domains, skills, target_rate,
  hours_per_week, locale, onboarded_at
) on public.profiles to authenticated;

grant select, delete, insert (
  platform_id, status, applied_at, reapply_after, notes
), update (
  status, applied_at, reapply_after, notes
) on public.platform_memberships to authenticated;

grant select, delete, insert (
  kind, job_id, platform_id, title, stage, position, applied_at,
  next_action_at, notes
), update (
  title, stage, position, applied_at, next_action_at, notes
) on public.tracker_cards to authenticated;

-- Stage history is written by trigger only.
grant select on public.card_events to authenticated;

grant select, delete, insert (filters, frequency), update (filters, frequency)
  on public.saved_searches to authenticated;

-- Tokens are never user-editable.
grant select, update (alerts_on, reminders_on, recap_on)
  on public.email_prefs to authenticated;

-- Created by the inbound-email function; users only resolve "Needs review"
-- (linking a card happens server-side, since FK checks ignore RLS).
grant select, update (status) on public.inbound_emails to authenticated;

-- ingest_runs and outbound_clicks: no grants. Admin reads use the service
-- role; clicks are written through log_outbound_click().

-- ---------------------------------------------------------------------------
-- 2. Policies. (select auth.uid()) is evaluated once per statement.
-- ---------------------------------------------------------------------------
create policy "Anyone can read platforms"
  on public.platforms for select to anon, authenticated
  using (true);

create policy "Anyone can read playbooks"
  on public.playbooks for select to anon, authenticated
  using (true);

create policy "Anyone can read jobs"
  on public.jobs for select to anon, authenticated
  using (true);

-- profiles: created on sign-up, removed with the account.
create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users read their own memberships"
  on public.platform_memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own memberships"
  on public.platform_memberships for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users update their own memberships"
  on public.platform_memberships for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users delete their own memberships"
  on public.platform_memberships for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own cards"
  on public.tracker_cards for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own cards"
  on public.tracker_cards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users update their own cards"
  on public.tracker_cards for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users delete their own cards"
  on public.tracker_cards for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own card history"
  on public.card_events for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own saved searches"
  on public.saved_searches for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own saved searches"
  on public.saved_searches for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users update their own saved searches"
  on public.saved_searches for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users delete their own saved searches"
  on public.saved_searches for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own email prefs"
  on public.email_prefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users update their own email prefs"
  on public.email_prefs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users read their own inbound emails"
  on public.inbound_emails for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users update their own inbound emails"
  on public.inbound_emails for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
