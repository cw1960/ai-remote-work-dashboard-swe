-- Core schema: the twelve tables from CLAUDE.md → "Data model".
--
-- Row-level security is switched on for every table here, with no policies
-- yet, so everything is deny-by-default for anon and signed-in users until
-- the RLS migration adds the read/owner policies. The service role bypasses
-- RLS (ingestion, admin).

-- ---------------------------------------------------------------------------
-- Private schema for helpers and trigger functions. Not exposed through the
-- Data API, so none of these can be called over RPC.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Country and language codes are stored as plain text / text[] (so generated
-- types stay string[]) and format-checked with these patterns:
--   countries: ISO 3166-1 alpha-2, upper case (MX)
--   languages: ISO 639-1, lower case (es)
-- The app validates against the full code lists.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.job_status as enum ('open', 'closed');

create type public.pay_unit as enum (
  'hour', 'day', 'week', 'month', 'year', 'task', 'session', 'project'
);

-- The six tracker columns, in board order.
create type public.card_stage as enum (
  'saved', 'applied', 'assessment', 'interviewing', 'offered', 'rejected'
);

create type public.card_kind as enum ('job', 'platform', 'manual');

create type public.card_event_source as enum ('user', 'email');

-- Platform Passport tile states.
create type public.membership_status as enum (
  'not_joined', 'applied', 'interviewing', 'active', 'rejected'
);

create type public.search_frequency as enum ('daily', 'weekly');

create type public.inbound_status as enum ('applied', 'needs_review', 'ignored');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 128 random bits as 32 lower-case hex characters. Safe in an email local
-- part (track+<token>@...) and in URLs.
create function private.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '')
$$;

-- ---------------------------------------------------------------------------
-- platforms (public read)
-- ---------------------------------------------------------------------------
create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 100),
  site_url text not null check (site_url ~ '^https://'),
  -- Sender domains used to recognise forwarded emails (auto-capture).
  email_domains text[] not null default '{}',
  -- Null means plain link, no referral (e.g. Outlier).
  referral_url_template text check (referral_url_template ~ '^https://'),
  countries_blocked text[] not null default '{}'
    check (array_position(countries_blocked, null) is null
           and array_to_string(countries_blocked, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  onboarding_notes text check (length(onboarding_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- playbooks (public read): what usually comes next on a platform per stage.
-- ---------------------------------------------------------------------------
create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms (id) on delete cascade,
  stage public.card_stage not null,
  next_step text not null check (length(next_step) between 1 and 1000),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, stage)
);

-- ---------------------------------------------------------------------------
-- jobs (public read). Written only by ingestion. Never deleted: jobs that drop
-- out of a source are marked closed so tracker cards keep their history.
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms (id) on delete restrict,
  external_id text not null check (length(external_id) between 1 and 200),
  title text not null check (length(title) between 1 and 300),
  -- Short summary only, never the full description.
  summary text check (length(summary) <= 500),
  domain text check (length(domain) <= 100),
  tags text[] not null default '{}',
  pay_min numeric(10, 2) check (pay_min >= 0),
  pay_max numeric(10, 2) check (pay_max >= 0),
  pay_unit public.pay_unit,
  languages text[] not null default '{}'
    check (array_position(languages, null) is null
           and array_to_string(languages, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$'),
  -- Countries the job is open to; empty means no restriction listed.
  countries text[] not null default '{}'
    check (array_position(countries, null) is null
           and array_to_string(countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  url text not null check (url ~ '^https://'),
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status public.job_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, external_id),
  check (pay_min is null or pay_max is null or pay_min <= pay_max),
  check ((status = 'closed') = (closed_at is not null))
);

-- Feed filters: open jobs by recency, platform, domain, pay, language, country.
create index jobs_open_posted_idx on public.jobs (posted_at desc nulls last)
  where status = 'open';
create index jobs_platform_status_idx on public.jobs (platform_id, status);
create index jobs_domain_idx on public.jobs (domain) where status = 'open';
create index jobs_pay_max_idx on public.jobs (pay_max) where status = 'open';
create index jobs_languages_idx on public.jobs using gin (languages);
create index jobs_countries_idx on public.jobs using gin (countries);
create index jobs_tags_idx on public.jobs using gin (tags);

-- ---------------------------------------------------------------------------
-- ingest_runs (admin only): one row per adapter run.
-- ---------------------------------------------------------------------------
create table public.ingest_runs (
  id bigint generated always as identity primary key,
  platform_id uuid not null references public.platforms (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  found integer not null default 0 check (found >= 0),
  inserted integer not null default 0 check (inserted >= 0),
  updated integer not null default 0 check (updated >= 0),
  closed integer not null default 0 check (closed >= 0),
  -- Null on success. A run with an error never closes jobs.
  error text
);

create index ingest_runs_platform_started_idx
  on public.ingest_runs (platform_id, started_at desc);

-- ---------------------------------------------------------------------------
-- profiles (owner). Created automatically on sign-up.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  display_name text check (length(display_name) <= 80),
  country text check (country ~ '^[A-Z]{2}$'),
  languages text[] not null default '{}'
    check (array_position(languages, null) is null
           and array_to_string(languages, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$'),
  domains text[] not null default '{}',
  skills text[] not null default '{}',
  target_rate numeric(8, 2) check (target_rate >= 0),
  hours_per_week smallint check (hours_per_week between 0 and 168),
  -- BCP 47 style (en, es, pt-BR). Supported locales live in the app config.
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- platform_memberships (owner): Platform Passport.
-- ---------------------------------------------------------------------------
create table public.platform_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  platform_id uuid not null references public.platforms (id) on delete cascade,
  status public.membership_status not null default 'applied',
  applied_at timestamptz,
  reapply_after date,
  notes text check (length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform_id)
);

create index platform_memberships_platform_idx
  on public.platform_memberships (platform_id);

-- ---------------------------------------------------------------------------
-- tracker_cards (owner): the Kanban. Three kinds:
--   job      → a job from our feed (job_id required)
--   platform → onboarding with a platform (platform_id required, no job)
--   manual   → anything else the user tracks (no job)
-- ---------------------------------------------------------------------------
create table public.tracker_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  kind public.card_kind not null,
  job_id uuid references public.jobs (id) on delete restrict,
  platform_id uuid references public.platforms (id) on delete set null,
  title text not null check (length(title) between 1 and 300),
  stage public.card_stage not null default 'saved',
  -- Order within a column; fractional so a move rewrites one row.
  position double precision not null default 0,
  applied_at timestamptz,
  next_action_at timestamptz,
  notes text check (length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    case kind
      when 'job' then job_id is not null
      when 'platform' then job_id is null and platform_id is not null
      when 'manual' then job_id is null
    end
  )
);

create index tracker_cards_user_stage_idx
  on public.tracker_cards (user_id, stage, position);
create index tracker_cards_user_next_action_idx
  on public.tracker_cards (user_id, next_action_at)
  where next_action_at is not null;
create index tracker_cards_job_idx on public.tracker_cards (job_id)
  where job_id is not null;
create index tracker_cards_platform_idx on public.tracker_cards (platform_id)
  where platform_id is not null;
-- One card per job and one onboarding card per platform, per user.
create unique index tracker_cards_user_job_key
  on public.tracker_cards (user_id, job_id) where kind = 'job';
create unique index tracker_cards_user_platform_key
  on public.tracker_cards (user_id, platform_id) where kind = 'platform';

-- ---------------------------------------------------------------------------
-- card_events (owner): stage history, written by trigger only.
-- user_id is copied from the card so RLS needs no join.
-- ---------------------------------------------------------------------------
create table public.card_events (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.tracker_cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Null for the event that records a card's creation.
  from_stage public.card_stage,
  to_stage public.card_stage not null,
  source public.card_event_source not null default 'user',
  at timestamptz not null default now()
);

create index card_events_card_at_idx on public.card_events (card_id, at);
create index card_events_user_at_idx on public.card_events (user_id, at);

-- ---------------------------------------------------------------------------
-- saved_searches (owner): feed filters the user gets alerts for.
-- ---------------------------------------------------------------------------
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  frequency public.search_frequency not null default 'daily',
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_searches_user_idx on public.saved_searches (user_id);
create index saved_searches_frequency_idx
  on public.saved_searches (frequency, last_sent_at);

-- ---------------------------------------------------------------------------
-- email_prefs (owner). Created automatically on sign-up with random tokens.
-- ---------------------------------------------------------------------------
create table public.email_prefs (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  alerts_on boolean not null default true,
  reminders_on boolean not null default true,
  recap_on boolean not null default true,
  -- Forwarding address local part: track+<inbound_token>@<inbound domain>.
  inbound_token text not null unique default private.random_token()
    check (inbound_token ~ '^[a-z0-9]{32}$'),
  unsubscribe_token text not null unique default private.random_token()
    check (unsubscribe_token ~ '^[a-z0-9]{32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- inbound_emails (owner): forwarded emails and what we matched them to.
-- ---------------------------------------------------------------------------
create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_domain text not null check (length(from_domain) between 1 and 255),
  subject text check (length(subject) <= 1000),
  matched_platform_id uuid references public.platforms (id) on delete set null,
  matched_stage public.card_stage,
  card_id uuid references public.tracker_cards (id) on delete set null,
  status public.inbound_status not null default 'needs_review',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inbound_emails_user_status_idx
  on public.inbound_emails (user_id, status, received_at desc);

-- ---------------------------------------------------------------------------
-- outbound_clicks: written only through log_outbound_click(), admin read.
-- ---------------------------------------------------------------------------
create table public.outbound_clicks (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  referrer_used boolean not null,
  at timestamptz not null default now()
);

create index outbound_clicks_job_at_idx on public.outbound_clicks (job_id, at);
create index outbound_clicks_at_idx on public.outbound_clicks (at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.platforms
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.playbooks
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.jobs
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.platform_memberships
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tracker_cards
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.saved_searches
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.email_prefs
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.inbound_emails
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sign-up: create the profile and email preferences for every new user.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (user_id, locale)
  values (
    new.id,
    case
      when requested_locale ~ '^[a-z]{2}(-[A-Z]{2})?$' then requested_locale
      else 'en'
    end
  );
  insert into public.email_prefs (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Stage history: every new card and every stage change writes a card_events
-- row. The email auto-capture function marks its changes with
--   set local app.card_event_source = 'email';
-- everything else is recorded as 'user'.
-- ---------------------------------------------------------------------------
create function private.record_card_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return new;
  end if;

  insert into public.card_events (card_id, user_id, from_stage, to_stage, source)
  values (
    new.id,
    new.user_id,
    case when tg_op = 'UPDATE' then old.stage end,
    new.stage,
    case current_setting('app.card_event_source', true)
      when 'email' then 'email'::public.card_event_source
      else 'user'::public.card_event_source
    end
  );
  return new;
end;
$$;

create trigger record_card_event
  after insert or update of stage on public.tracker_cards
  for each row execute function private.record_card_event();

-- ---------------------------------------------------------------------------
-- Outbound clicks: /go/<job-id> calls this for signed-in and anonymous
-- visitors alike. Returns whether the platform has a referral template, so
-- the redirect and the log always agree.
-- ---------------------------------------------------------------------------
create function public.log_outbound_click(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_referral boolean;
begin
  select p.referral_url_template is not null
    into has_referral
  from public.jobs j
  join public.platforms p on p.id = j.platform_id
  where j.id = p_job_id;

  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'P0002';
  end if;

  insert into public.outbound_clicks (job_id, user_id, referrer_used)
  values (p_job_id, auth.uid(), has_referral);

  return has_referral;
end;
$$;

revoke all on function public.log_outbound_click(uuid) from public;
grant execute on function public.log_outbound_click(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row-level security on for every table (policies come in the next
-- migration). Until then only the service role can read or write.
-- ---------------------------------------------------------------------------
alter table public.platforms enable row level security;
alter table public.playbooks enable row level security;
alter table public.jobs enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_memberships enable row level security;
alter table public.tracker_cards enable row level security;
alter table public.card_events enable row level security;
alter table public.saved_searches enable row level security;
alter table public.email_prefs enable row level security;
alter table public.inbound_emails enable row level security;
alter table public.outbound_clicks enable row level security;
