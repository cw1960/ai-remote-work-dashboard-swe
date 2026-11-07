-- The thirteen platforms from PLAN.md → "Job sources".
--
-- Reference data every environment needs, so it lives in a migration rather
-- than seed.sql. Referral templates, email domains and blocked countries are
-- left empty on purpose: fill them in once confirmed in each platform's own
-- dashboard or terms, never from third-party reports. Re-running is a no-op.
insert into public.platforms (slug, name, site_url, onboarding_notes)
values
  ('mercor', 'Mercor', 'https://www.mercor.com',
   'Apply to individual listings; many include an AI interview.'),
  ('micro1', 'micro1', 'https://www.micro1.ai',
   'Apply once to the platform, pass the AI interview, then apply to projects.'),
  ('alignerr', 'Alignerr', 'https://www.alignerr.com',
   'Apply to individual roles listed on the jobs page.'),
  ('outlier', 'Outlier', 'https://outlier.ai',
   'Apply to the platform, then get matched to projects. Plain link only, no referral.'),
  ('dataannotation', 'DataAnnotation', 'https://www.dataannotation.tech',
   'All roles share one application with a starter assessment.'),
  ('handshake-ai', 'Handshake AI', 'https://joinhandshake.com/ai/',
   'Applying needs a Handshake account.'),
  ('invisible', 'Invisible', 'https://job-boards.eu.greenhouse.io/agency',
   'AI trainer roles are posted on a Greenhouse job board.'),
  ('welo-data', 'Welo Data', 'https://jobs.lever.co/weloglobal',
   'Rater and AI training roles are posted on a Lever job board.'),
  ('terac', 'Terac', 'https://terac.com/opportunities',
   'Paid per study or session; each opportunity shows the spots left.'),
  ('turing', 'Turing', 'https://work.turing.com/jobs', null),
  ('sme-careers', 'SME Careers', 'https://sme.careers', null),
  ('mindrift', 'Mindrift', 'https://mindrift.ai',
   'One application covers several project categories.'),
  ('opentrain-ai', 'OpenTrain AI', 'https://www.opentrain.ai',
   'A marketplace behind a login. Listed as a platform card only.')
on conflict (slug) do nothing;
