-- Job matching (Phase 5): one ranking for the dashboard's Matched jobs and
-- the reasons shown on feed cards. Rules only, no AI.
--
-- match_jobs(p_user_id) scores every open job against the user's profile:
--   +40  the job's field is one of the user's fields
--   +25  the user speaks one of the job's languages
--   +20  hourly pay reaches the user's target rate (-10 if well below it)
--   +10  the job is limited to countries and the user's country is one
--   +10  posted in the last 7 days (+5 in the last 30)
-- Jobs the user can't take (their country isn't allowed, or is blocked) are
-- left out, and so are jobs they already track. Reasons come back as data;
-- the app words them in the user's language.
--
-- security invoker: profiles and tracker_cards are read under RLS, so a
-- user can only ever match themselves.

create function public.match_jobs(
  p_user_id uuid default auth.uid(),
  p_limit integer default 20,
  p_job_ids uuid[] default null
)
returns table (
  job_id uuid,
  score integer,
  matched_domain text,
  matched_languages text[],
  pay_ok boolean,
  country_ok text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select p.domains, p.languages, p.country, p.target_rate
    from public.profiles p
    where p.user_id = p_user_id and p_user_id = auth.uid()
  ),
  scored as (
    select
      j.id,
      coalesce(j.posted_at, j.first_seen_at) as posted,
      case when j.domain = any (me.domains) then j.domain end as domain_hit,
      array(
        select l from unnest(j.languages) l
        where l = any (me.languages)
        order by l
      ) as language_hits,
      case
        when me.target_rate is null or j.pay_unit is distinct from 'hour'
          or j.pay_max is null then null
        else j.pay_max >= me.target_rate
      end as pay_hit,
      case
        when me.country is not null and cardinality(j.countries) > 0
          and me.country = any (j.countries) then me.country
      end as country_hit,
      me.target_rate,
      j.pay_max
    from public.jobs j
    cross join me
    where j.status = 'open'
      and (p_job_ids is null or j.id = any (p_job_ids))
      -- Eligible where the user lives (unknown country: everything).
      and (
        me.country is null
        or ((cardinality(j.countries) = 0 or me.country = any (j.countries))
            and not me.country = any (j.countries_blocked))
      )
      -- Already on the user's board: no need to suggest it.
      and not exists (
        select 1 from public.tracker_cards c
        where c.user_id = p_user_id and c.job_id = j.id
      )
  )
  select
    s.id,
    (
      case when s.domain_hit is not null then 40 else 0 end
      + case when cardinality(s.language_hits) > 0 then 25 else 0 end
      + case
          when s.pay_hit then 20
          when s.pay_hit is false and s.pay_max < s.target_rate * 0.8 then -10
          else 0
        end
      + case when s.country_hit is not null then 10 else 0 end
      + case
          when s.posted > now() - interval '7 days' then 10
          when s.posted > now() - interval '30 days' then 5
          else 0
        end
    )::integer,
    s.domain_hit,
    s.language_hits,
    s.pay_hit is true,
    s.country_hit
  from scored s
  order by 2 desc, s.posted desc nulls last, s.id
  limit p_limit
$$;

revoke all on function public.match_jobs(uuid, integer, uuid[]) from public, anon;
grant execute on function public.match_jobs(uuid, integer, uuid[]) to authenticated;
