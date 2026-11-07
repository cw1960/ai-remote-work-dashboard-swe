-- Referral link templates used by /go/<job>.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select is(
  (select referral_url_template from public.platforms where slug = 'micro1'),
  'https://jobs.micro1.ai/post/{external_id}?referralCode=00000000-0000-4000-8000-000000000001&utm_source=referral&utm_medium=share&utm_campaign=job_referral',
  'micro1 has its confirmed referral link'
);

select is(
  (select referral_url_template from public.platforms where slug = 'mercor'),
  'https://work.mercor.com/explore?listingId={external_id}&referralCode=00000000-0000-4000-8000-000000000002',
  'Mercor has its confirmed referral link'
);

select is(
  (select count(*)::int from public.platforms
   where referral_url_template is not null
     and slug not in ('micro1', 'mercor')),
  0,
  'other platforms keep plain links until their formats are confirmed'
);

select unalike(
  (select onboarding_notes from public.platforms where slug = 'outlier'),
  '%no referral%',
  'the Outlier note no longer says it has no referral'
);

select * from finish();
rollback;
