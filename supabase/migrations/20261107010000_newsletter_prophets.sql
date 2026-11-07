-- Newsletter pivot P9 (owner, 2026-11-06): Prophets & Heretics.
--
-- Every issue quotes a thinker from the past or present on the day's lead
-- story. The quotes themselves live in a curated library in the newsletter
-- repo (cw1960/airemoteworktoday, src/prophets/library.json), approved by
-- the owner through PRs; this table only records which quote an issue
-- used, so none repeats within 60 days and no thinker runs more than twice
-- a week. One row per issue day: a re-run of the day's draft replaces it.

create table public.prophet_uses (
  issue_date date primary key,
  quote_id text not null check (quote_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  thinker text not null check (char_length(thinker) between 1 and 200),
  recorded_at timestamptz not null default now()
);

comment on table public.prophet_uses is
  'Which library quote each newsletter issue used (Prophets & Heretics). Admin only.';

create index prophet_uses_quote_idx on public.prophet_uses (quote_id);

alter table public.prophet_uses enable row level security;
revoke all on public.prophet_uses from anon, authenticated;

-- The quotes used on or after p_since, for the Writer's rotation.
create function public.newsletter_prophet_uses(p_token text, p_since date)
returns table (issue_date date, quote_id text, thinker text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  return query
  select u.issue_date, u.quote_id, u.thinker
  from public.prophet_uses u
  where u.issue_date >= p_since
  order by u.issue_date desc;
end;
$$;

-- Records the quote an issue used; a re-run for the same day replaces it.
create function public.newsletter_record_prophet(
  p_token text,
  p_issue_date date,
  p_quote_id text,
  p_thinker text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_newsletter_token(p_token);
  insert into public.prophet_uses (issue_date, quote_id, thinker)
  values (p_issue_date, p_quote_id, p_thinker)
  on conflict (issue_date) do update
    set quote_id = excluded.quote_id,
        thinker = excluded.thinker,
        recorded_at = now();
end;
$$;

revoke all on function public.newsletter_prophet_uses(text, date) from public, authenticated;
revoke all on function public.newsletter_record_prophet(text, date, text, text) from public, authenticated;
grant execute on function public.newsletter_prophet_uses(text, date) to anon, service_role;
grant execute on function public.newsletter_record_prophet(text, date, text, text) to anon, service_role;
