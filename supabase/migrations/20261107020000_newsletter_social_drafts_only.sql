-- Newsletter social, drafts only (owner, 2026-11-06): X no longer has an
-- affordable API, so the day's posts are emailed to the owner as drafts to
-- schedule by hand, and nothing is posted automatically. The hourly
-- publishing runs have nothing to do, so their schedules go; the 08:30
-- drafting run (social-draft) stays. private.invoke_social_posts() stays
-- too, so publishing can be scheduled again if it is ever wanted.

select cron.unschedule('social-publish-day');
select cron.unschedule('social-publish-night');
