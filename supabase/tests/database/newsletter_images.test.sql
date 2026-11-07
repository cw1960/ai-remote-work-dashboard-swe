-- Newsletter pivot P5: the images bucket and the token check behind the
-- newsletter-image Edge Function.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

create temporary table t (token text) on commit drop;
insert into t select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_token';
grant select on t to service_role;

select ok(
  (select public from storage.buckets where id = 'newsletter-images'),
  'the images bucket is public');
select is(
  (select allowed_mime_types from storage.buckets where id = 'newsletter-images'),
  array['image/png', 'image/jpeg', 'image/webp'],
  'only images go in it');
select ok(not has_function_privilege('anon', 'public.verify_newsletter_token(text)', 'execute'),
  'anon may not check the token');
select ok(not has_function_privilege('authenticated', 'public.verify_newsletter_token(text)', 'execute'),
  'signed-in users may not check the token');

set local role service_role;
select ok(public.verify_newsletter_token((select token from t)),
  'the newsletter token is accepted');
select ok(not public.verify_newsletter_token('wrong'), 'a wrong token is refused');
reset role;

select * from finish();
rollback;
