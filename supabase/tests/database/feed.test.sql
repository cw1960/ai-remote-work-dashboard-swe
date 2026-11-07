-- feed_facets(): filter options for the public feed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

-- Start from a known set of jobs.
delete from public.outbound_clicks;
delete from public.tracker_cards;
delete from public.jobs;

insert into public.jobs (platform_id, external_id, title, url, domain, languages, status, closed_at)
select p.id, v.ext, 'Job ' || v.ext, 'https://example.com/' || v.ext, v.domain, v.langs::text[],
       v.status::public.job_status, case when v.status = 'closed' then now() end
from (values
  ('mercor', 'm1', 'law', '{es}', 'open'),
  ('mercor', 'm2', 'law', '{es,en}', 'open'),
  ('micro1', 'x1', 'science', '{}', 'open'),
  ('micro1', 'x2', 'science', '{fr}', 'closed')
) as v(slug, ext, domain, langs, status)
join public.platforms p on p.slug = v.slug;

set local role anon;

select is((public.feed_facets() ->> 'total')::int, 3, 'counts open jobs only');

select is(
  public.feed_facets() -> 'platforms',
  '[{"slug":"mercor","name":"Mercor","count":2},{"slug":"micro1","name":"micro1","count":1}]'::jsonb,
  'lists platforms with open jobs, busiest first'
);

select is(
  public.feed_facets() -> 'domains',
  '[{"value":"law","count":2},{"value":"science","count":1}]'::jsonb,
  'lists domains with counts'
);

select is(
  public.feed_facets() -> 'languages',
  '[{"value":"es","count":2},{"value":"en","count":1}]'::jsonb,
  'lists languages of open jobs only'
);

reset role;
set local role authenticated;
select lives_ok($$ select public.feed_facets() $$, 'signed-in users can call it too');
reset role;

select * from finish();
rollback;
