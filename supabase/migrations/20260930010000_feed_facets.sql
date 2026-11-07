-- Filter options for the public job feed: platforms and languages that have
-- open jobs, with counts. One call instead of scanning jobs in the app.
create function public.feed_facets()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.jobs where status = 'open'),
    'platforms', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'name', p.name, 'count', c.n)
                       order by c.n desc, p.name)
      from (
        select platform_id, count(*) as n
        from public.jobs where status = 'open'
        group by platform_id
      ) c
      join public.platforms p on p.id = c.platform_id
    ), '[]'),
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object('value', domain, 'count', n) order by n desc, domain)
      from (
        select domain, count(*) as n
        from public.jobs where status = 'open' and domain is not null
        group by domain
      ) d
    ), '[]'),
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object('value', lang, 'count', n) order by n desc, lang)
      from (
        select lang, count(*) as n
        from public.jobs, unnest(languages) as lang
        where status = 'open'
        group by lang
      ) l
    ), '[]')
  )
$$;

revoke all on function public.feed_facets() from public;
grant execute on function public.feed_facets() to anon, authenticated, service_role;

-- Title search in the feed (ILIKE '%term%') without a full scan per keystroke.
create extension if not exists pg_trgm with schema extensions;
create index jobs_title_trgm_idx on public.jobs
  using gin (title extensions.gin_trgm_ops);
