-- Platform playbooks (Phase 6): for each stage of a Mercor or micro1 card,
-- what usually comes next and a short checklist. Drafted from each
-- platform's public help pages (talent.docs.mercor.com, micro1.ai/experts
-- and micro1.ai/interview-prep, read 2026-10-02) and reviewed by the owner.
-- Upserts, so a later migration can revise the text the same way.

insert into public.playbooks (platform_id, stage, next_step, checklist)
select p.id, v.stage::public.card_stage, v.next_step, v.checklist::jsonb
from public.platforms p
join (values
  -- Mercor -----------------------------------------------------------------
  ('mercor', 'saved',
   'Click Apply Now on the listing and Mercor shows a checklist of steps: usually your resume, one or more assessments and work authorization.',
   '["Use Google Chrome on a desktop or laptop", "Upload an up-to-date resume", "Check which assessments the role needs: one you have already passed carries over"]'),
  ('mercor', 'applied',
   'Finish every step on the application checklist, then submit. The confirmation screen shows the expected timeline.',
   '["Complete any assessments still open on the checklist", "Keep your skills and availability current on your profile", "Watch your email and the Applications tab"]'),
  ('mercor', 'assessment',
   'Mercor assessments are forms or an AI interview of about 20 minutes. You can retake the official AI interview up to three times.',
   '["Try the free practice interview first", "Use Chrome with camera and microphone allowed, and test them", "Pick a quiet room with a steady connection; have pen and paper ready"]'),
  ('mercor', 'interviewing',
   'Some roles add a paid work trial before an offer. Trials have limited spots and strict deadlines, and you can accept only one.',
   '["Screenshot the offer page (rate and payout) before accepting a trial", "Set up payments (Stripe or Wise) with your exact legal name", "Finish the trial task before its deadline"]'),
  ('mercor', 'offered',
   'Open the offer in the Offers tab and sign the offer letter first: it unlocks the rest of onboarding. Offers expire, so check the deadline.',
   '["Sign the Worker Agreement, CIIAA and your tax form (W-9 or W-8BEN)", "Verify your ID with Persona (done once)", "Complete the background check: it can take one to two weeks", "Install the Insightful desktop app before logging hours"]'),
  ('mercor', 'rejected',
   'Assessments you have passed stay on your profile and can qualify you for other roles, sometimes without a new application.',
   '["Keep your profile, skills and availability up to date", "Check the Assessments tab for recommended assessments", "Look for similar roles in the feed"]'),
  -- micro1 -----------------------------------------------------------------
  ('micro1', 'saved',
   'Apply on micro1''s jobs portal. The usual path is: apply, take the AI interview, get onboarded, start earning.',
   '["Check that micro1 can hire from the country you live in", "Make sure your resume describes each role in detail"]'),
  ('micro1', 'applied',
   'Next is usually the AI interview with Zara. You can follow your application''s status in your micro1 talent dashboard.',
   '["Take a free practice interview at micro1.ai/interview-prep", "Watch for emails from @micro1.ai, @micro1.io or @micro1.co: those are official"]'),
  ('micro1', 'assessment',
   'micro1 certifies your skills with structured assessments and an AI interview. Practice interviews run about 18 minutes.',
   '["Pick a quiet room and test your camera and microphone", "Certify extra skills to qualify for more projects"]'),
  ('micro1', 'interviewing',
   'Certification makes you eligible for projects but does not guarantee one. If you are selected, micro1 emails you a confirmation with onboarding details.',
   '["Keep your profile and availability up to date", "Answer onboarding emails promptly"]'),
  ('micro1', 'offered',
   'Follow the onboarding steps in micro1''s selection email and your talent dashboard.',
   '["Complete every onboarding step in the email", "Confirm your start date and weekly hours"]'),
  ('micro1', 'rejected',
   'Your profile stays active and can still be considered for future projects that match your certified skills.',
   '["Certify additional skills", "Add detail to your experience descriptions", "Look for similar roles in the feed"]')
) as v(slug, stage, next_step, checklist) on v.slug = p.slug
on conflict (platform_id, stage) do update
set next_step = excluded.next_step,
    checklist = excluded.checklist;
