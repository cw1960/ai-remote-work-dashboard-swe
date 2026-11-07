-- Email auto-capture (Phase 6). A user forwards a platform's email to
-- track+<inbound_token>@in.<domain>; Resend calls the inbound-email Edge
-- Function, which verifies the webhook, applies the rules in
-- supabase/functions/_shared/inbound/rules.ts and records the result here.
-- Only the sender's domain and the subject are stored, never the body.

-- Where each promoted platform's email comes from (the rules match these,
-- subdomains included).
update public.platforms set email_domains = '{mercor.com}' where slug = 'mercor';
update public.platforms
set email_domains = '{micro1.ai,micro1.io,micro1.co}'
where slug = 'micro1';

-- Moves (or creates) the card an email is about and links the email to it.
-- Moves only go forward, except to Rejected; card_events record 'email'.
create function private.place_inbound_email(
  p_email_id uuid,
  p_user_id uuid,
  p_platform_id uuid,
  p_stage public.card_stage,
  p_card_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.tracker_cards%rowtype;
  v_order constant public.card_stage[] :=
    array['saved', 'applied', 'assessment', 'interviewing', 'offered', 'rejected']::public.card_stage[];
  v_position double precision;
begin
  perform set_config('app.card_event_source', 'email', true);

  select coalesce(max(c.position), 0) + 1 into v_position
  from public.tracker_cards c
  where c.user_id = p_user_id and c.stage = p_stage;

  if p_card_id is null then
    insert into public.tracker_cards (user_id, kind, platform_id, title, stage, position, applied_at)
    select p_user_id, 'platform', p.id, p.name, p_stage, v_position,
           case when p_stage <> 'saved' then now() end
    from public.platforms p
    where p.id = p_platform_id
    returning * into v_card;
  else
    select * into v_card from public.tracker_cards c
    where c.id = p_card_id and c.user_id = p_user_id;
    if not found then
      raise exception 'card not found' using errcode = 'P0002';
    end if;
    if p_stage = 'rejected'
       or array_position(v_order, p_stage) > array_position(v_order, v_card.stage) then
      update public.tracker_cards c
      set stage = p_stage,
          position = v_position,
          applied_at = coalesce(c.applied_at, case when p_stage <> 'saved' then now() end)
      where c.id = v_card.id;
    end if;
  end if;

  update public.inbound_emails e
  set status = 'applied', card_id = v_card.id,
      matched_platform_id = coalesce(e.matched_platform_id, p_platform_id),
      matched_stage = p_stage
  where e.id = p_email_id;

  return v_card.id;
end;
$$;

revoke all on function private.place_inbound_email(uuid, uuid, uuid, public.card_stage, uuid) from public;

-- Called by the inbound-email Edge Function (service role) for each
-- received email. Returns what happened:
--   unknown_token   no such forwarding address (nothing stored)
--   unknown_sender  not from the user or a platform (nothing stored)
--   applied         a card was moved or created
--   needs_review    stored for the user to decide
create function public.record_inbound_email(
  p_token text,
  p_from text,
  p_subject text,
  p_platform text,
  p_stage public.card_stage
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_from text := lower(trim(p_from));
  v_from_domain text := split_part(lower(trim(p_from)), '@', 2);
  v_platform public.platforms%rowtype;
  v_email_id uuid;
  v_cards uuid[];
begin
  select e.user_id, lower(u.email) into v_user_id, v_user_email
  from public.email_prefs e
  join auth.users u on u.id = e.user_id
  where e.inbound_token = p_token;
  if v_user_id is null then
    return 'unknown_token';
  end if;

  -- Only the user themselves (forwarding by hand) or a platform (auto-
  -- forwarding keeps the sender) may add to their board.
  if v_from is distinct from v_user_email and not exists (
    select 1 from public.platforms p, unnest(p.email_domains) d
    where v_from_domain = d or v_from_domain like '%.' || d
  ) then
    return 'unknown_sender';
  end if;

  select * into v_platform from public.platforms p where p.slug = p_platform;

  insert into public.inbound_emails (user_id, from_domain, subject, matched_platform_id, matched_stage)
  values (
    v_user_id,
    -- The platform's domain when known (hand-forwarded mail comes from the
    -- user's own address, which we don't need to keep).
    coalesce(v_platform.email_domains[1], nullif(v_from_domain, ''), 'unknown'),
    left(p_subject, 1000),
    v_platform.id,
    p_stage
  )
  returning id into v_email_id;

  if v_platform.id is null or p_stage is null then
    return 'needs_review';
  end if;

  select array_agg(c.id) into v_cards
  from public.tracker_cards c
  left join public.jobs j on j.id = c.job_id
  where c.user_id = v_user_id
    and (c.platform_id = v_platform.id or j.platform_id = v_platform.id);

  -- One card for this platform: it's that one. None: a platform card.
  -- Several: the user picks.
  if coalesce(cardinality(v_cards), 0) > 1 then
    return 'needs_review';
  end if;
  perform private.place_inbound_email(
    v_email_id, v_user_id, v_platform.id, p_stage, v_cards[1]
  );
  return 'applied';
end;
$$;

revoke all on function public.record_inbound_email(text, text, text, text, public.card_stage)
  from public, anon, authenticated;
grant execute on function public.record_inbound_email(text, text, text, text, public.card_stage)
  to service_role;

-- "Needs review": the user files an email under one of their cards (or,
-- with no card, a new card for the matched platform) at a stage.
create function public.resolve_inbound_email(
  p_email_id uuid,
  p_stage public.card_stage,
  p_card_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email public.inbound_emails%rowtype;
begin
  select * into v_email from public.inbound_emails e
  where e.id = p_email_id and e.user_id = auth.uid() and e.status = 'needs_review';
  if not found then
    raise exception 'email not found' using errcode = 'P0002';
  end if;
  if p_card_id is null and v_email.matched_platform_id is null then
    raise exception 'pick a card' using errcode = '22023';
  end if;
  return private.place_inbound_email(
    v_email.id, v_email.user_id, v_email.matched_platform_id, p_stage, p_card_id
  );
end;
$$;

revoke all on function public.resolve_inbound_email(uuid, public.card_stage, uuid)
  from public, anon;
grant execute on function public.resolve_inbound_email(uuid, public.card_stage, uuid)
  to authenticated;

-- Users see their own forwarding address in Settings (RLS keeps it to
-- their row); they still can't change it.
grant select (inbound_token) on public.email_prefs to authenticated;
