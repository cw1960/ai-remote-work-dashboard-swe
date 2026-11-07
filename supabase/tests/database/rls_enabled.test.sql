-- Guard: every table in the public schema must have row-level security on.
-- Runs with `pnpm db:test` (pgTAP). Per-table policy tests live beside it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every public table has row-level security enabled'
);

-- New tables get Supabase's default grants (including TRUNCATE, which RLS
-- does not cover). Each migration must revoke them and grant precisely.
select is_empty(
  $$
    select table_name || ' ' || grantee || ' ' || privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
  $$,
  'API roles have no TRUNCATE, TRIGGER or REFERENCES on public tables'
);

-- Tables without policies are admin-only by design; any other table without
-- a policy is a mistake.
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname not in ('ingest_runs', 'outbound_clicks', 'site_events',
                            'newsletter_runs', 'job_shortlists', 'social_drafts',
                            'resume_generations', 'listen_runs',
                            'listen_threads', 'listen_comments',
                            'listen_stories', 'listen_story_threads',
                            'story_facts', 'story_sources', 'story_quotes',
                            'prophet_uses')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  $$,
  'every non-admin public table has at least one policy'
);

select * from finish();
rollback;
