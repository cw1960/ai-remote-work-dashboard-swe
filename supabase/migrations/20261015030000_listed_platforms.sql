-- More platforms on the site (owner's decision, 2026-10-15). Until now the
-- site listed only referral platforms (Mercor, micro1); the four vetted
-- newsletter sources (Invisible, Welo Data, xAI, RemoExperts) were fetched
-- but hidden. They now show on the site too, with plain links (no referral).
--
-- `listed` says which platforms the site names: platform pages, the sitemap,
-- the Platform Passport, onboarding and platform cards. The other seeded
-- platforms (Outlier, Alignerr, …) stay unlisted: we never fetch them.
-- `has_referral` lets pages show the affiliate notice only where it applies.

alter table public.platforms
  add column listed boolean not null default false,
  add column has_referral boolean
    generated always as (referral_url_template is not null) stored,
  -- A listed platform's jobs are on the site.
  add constraint platforms_listed_on_site check (not (listed and newsletter_only));

update public.platforms
set newsletter_only = false
where slug in ('invisible', 'welo-data', 'xai', 'remoexperts');

update public.platforms
set listed = true
where slug in ('mercor', 'micro1', 'invisible', 'welo-data', 'xai', 'remoexperts')
   or referral_url_template is not null;

-- Clearer "how joining works" text for the newly listed platforms, from each
-- platform's own job board.
update public.platforms
set onboarding_notes = 'Freelance AI trainer projects, each posted as its own role on Invisible''s job board. Apply to each project separately.'
where slug = 'invisible';

update public.platforms
set onboarding_notes = 'Remote rater and AI training roles from Welo Data (part of Welocalize), posted on its Lever job board. Apply to each role separately.'
where slug = 'welo-data';
