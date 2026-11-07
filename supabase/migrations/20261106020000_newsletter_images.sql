-- Newsletter pivot P5 (owner, 2026-11-05): images for the daily issue.
--
-- The newsletter workflow draws each issue's illustrations with Google's
-- Gemini API and needs somewhere public to put them, because Beehiiv's
-- Create post API takes an image block by URL only. They go in a public
-- Storage bucket, uploaded through the newsletter-image Edge Function,
-- which checks the newsletter token (below) and writes with the service
-- role. Readers' email clients load them from the bucket's public URL.
-- AI illustrations only (CLAUDE.md in the newsletter repo → Decision 10);
-- no personal data.

-- Whether p_token is the newsletter token. For the Edge Function only.
create function public.verify_newsletter_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select decrypted_secret = p_token
     from vault.decrypted_secrets
     where name = 'newsletter_token'),
    false
  )
$$;

revoke all on function public.verify_newsletter_token(text) from public, anon, authenticated;
grant execute on function public.verify_newsletter_token(text) to service_role;

-- Public read (the images are in sent emails); writes only with the
-- service role, which bypasses Storage's RLS. PNG, JPEG or WebP, 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'newsletter-images', 'newsletter-images', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;
