-- Newsletter N2: cookieless, first-party site events.
--
-- Counts newsletter signups made on this site, by where on the site the
-- form was and the campaign (UTM) tags of the page. Nothing here identifies
-- a person: no email, no user id, no IP address. Admin read only (service
-- role); rows are written through log_site_event().

create table public.site_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('newsletter_signup')),
  source text not null check (source in ('footer', 'job', 'dashboard')),
  utm_source text check (char_length(utm_source) between 1 and 100),
  utm_medium text check (char_length(utm_medium) between 1 and 100),
  utm_campaign text check (char_length(utm_campaign) between 1 and 100),
  at timestamptz not null default now()
);

comment on table public.site_events is
  'Anonymous site events (newsletter signups by source). No personal data.';

create index site_events_at_idx on public.site_events (at);

alter table public.site_events enable row level security;

-- New tables get Supabase's default grants; the API roles get none here.
revoke all on public.site_events from anon, authenticated;
revoke all on sequence public.site_events_id_seq from anon, authenticated;

-- Records one event. Empty campaign tags are stored as null; anything the
-- checks above reject raises, so callers must validate first.
create function public.log_site_event(
  p_event text,
  p_source text,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.site_events
    (event, source, utm_source, utm_medium, utm_campaign)
  values (
    p_event,
    p_source,
    nullif(p_utm_source, ''),
    nullif(p_utm_medium, ''),
    nullif(p_utm_campaign, '')
  )
$$;

revoke all on function public.log_site_event(text, text, text, text, text)
  from public;
grant execute on function public.log_site_event(text, text, text, text, text)
  to anon, authenticated, service_role;
