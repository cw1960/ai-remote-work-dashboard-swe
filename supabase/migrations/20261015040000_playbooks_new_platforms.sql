-- Platform playbooks for the platforms listed on 2026-10-15 (Invisible,
-- Welo Data, xAI, RemoExperts). Drafted from each platform's own job
-- postings, read through their official job-board feeds on 2026-10-15
-- (boards-api.greenhouse.io agency and xai, api.lever.co weloglobal, the
-- rex.zone opportunities feed); never from third-party reviews. Where a
-- platform says little about a stage, the text gives general preparation
-- advice instead of guessing at its process. Reviewed by the owner.
-- Upserts, like 20261002050000_playbooks.sql.

insert into public.playbooks (platform_id, stage, next_step, checklist)
select p.id, v.stage::public.card_stage, v.next_step, v.checklist::jsonb
from public.platforms p
join (values
  -- Invisible (Meridial Marketplace) -----------------------------------------
  ('invisible', 'saved',
   'Invisible posts each freelance AI trainer project as its own role, through its Meridial Marketplace. The posting shows a pay range; the exact rate is set after Invisible reviews your experience, expertise and location.',
   '["Check that you can work as a contractor where you live: Meridial doesn''t sponsor visas", "Have a secure computer and high-speed internet ready (voice projects also need a good microphone)", "Match your resume to the project''s required expertise"]'),
  ('invisible', 'applied',
   'Invisible reviews your experience and expertise for the project. Each project is a separate application, so you can apply to several that fit.',
   '["Watch your email, including spam, for next steps", "Apply to other Invisible projects that match your expertise", "Keep your work history the same everywhere you apply"]'),
  ('invisible', 'assessment',
   'If Invisible asks you to complete an assessment or screening step, treat it like the real work: it''s how your fit for the project is judged.',
   '["Use a quiet room, your secure computer and a stable connection", "Read every instruction before you start", "Answer from your own knowledge: don''t paste in AI-generated answers unless the instructions allow it"]'),
  ('invisible', 'interviewing',
   'Some projects require a background check before work starts. Answer any requests for documents or details promptly.',
   '["Have your ID and proof of your qualifications ready", "Check that your name matches across your documents", "Reply quickly to every email from Invisible"]'),
  ('invisible', 'offered',
   'Work is set out in a Statement of Work (SOW). By accepting it, you confirm you''re authorized to do the work in your country without sponsorship.',
   '["Read the SOW: rate, deliverables and timeline", "Check the rate matches what you were offered", "Remember you''re a contractor: no health insurance or paid time off"]'),
  ('invisible', 'rejected',
   'Each project is a separate role, so a no on one doesn''t close the others.',
   '["Look for other Invisible projects in the feed that fit your expertise", "Strengthen the parts of your resume that match each project''s required expertise"]'),
  -- Welo Data ----------------------------------------------------------------
  ('welo-data', 'saved',
   'Welo Data''s hiring is self-paced and automated, with no formal interview. You need a desktop or laptop computer to apply and onboard.',
   '["Check that you can legally work on freelance projects in the role''s country", "Turn off any VPN: Welo Data runs identity checks", "Apply from a desktop or laptop, not a phone"]'),
  ('welo-data', 'applied',
   'After you apply, Welo Data guides you through the next steps online, including identity checks.',
   '["Watch your email, including spam, for the link to your next steps", "Keep your details the same at every step", "Questions about the process: TalentRequests@welocalize.com"]'),
  ('welo-data', 'assessment',
   'Expect an assessment or qualification step for the project. Finishing the application, assessment and onboarding doesn''t guarantee a project or a minimum amount of work.',
   '["Read the project guidelines closely: your work is judged against them", "Don''t use generative AI tools unless the project allows them", "Work on your own, from your own knowledge and judgment"]'),
  ('welo-data', 'interviewing',
   'There''s no formal interview at Welo Data. The next step is usually signing the project''s agreements and finishing onboarding.',
   '["Sign the Non-Disclosure Agreement and Service Level Agreement", "Join any live office hours or training sessions for the project", "Finish every onboarding step in the email"]'),
  ('welo-data', 'offered',
   'Once you''re onboarded, work follows the project''s needs, so weekly hours can vary.',
   '["Follow the project guidelines on every task", "Keep a record of your hours and tasks", "Expect your hours to change with the project"]'),
  ('welo-data', 'rejected',
   'Projects depend on client needs and change often. Welo Data posts many roles by language and country.',
   '["Look for other Welo Data roles in your language", "Check the requirements of each role before you apply"]'),
  -- xAI ------------------------------------------------------------------------
  ('xai', 'saved',
   'xAI hires AI Tutors to train Grok. Roles can be full-time, part-time or contract, depending on the role and the candidate.',
   '["Check where the role can be done from: some are worldwide, some US and Canada only", "Check your computer: a Chromebook, a Mac with macOS 11 or later, or Windows 10 or later", "Match your resume to the role''s field"]'),
  ('xai', 'applied',
   'Apply to each role on xAI''s job board. xAI shares the role''s details during the interview process.',
   '["Watch your email, including spam, for next steps", "Apply only to roles that match your expertise"]'),
  ('xai', 'assessment',
   'If xAI sends an assessment, it tests the expertise the role asks for.',
   '["Use a quiet room and a stable connection", "Read every instruction before you start", "Answer from your own knowledge"]'),
  ('xai', 'interviewing',
   'xAI shares role details, including hours and benefits, during the interview process. Contractor projects usually need at least 10 hours a week, though that isn''t fixed.',
   '["Ask whether the role is full-time, part-time or contract", "Ask about weekly hours and the schedule: some roles have set weekend hours", "Have examples of your expertise ready"]'),
  ('xai', 'offered',
   'Read the offer for the employment type, hours and pay before you accept.',
   '["Confirm full-time, part-time or contract", "Confirm your schedule and time zone", "Make sure your computer meets the requirements"]'),
  ('xai', 'rejected',
   'xAI posts AI Tutor roles in many fields and languages.',
   '["Look for other xAI roles in the feed that fit your expertise", "Strengthen the parts of your resume that match the role''s field"]'),
  -- RemoExperts ----------------------------------------------------------------
  ('remoexperts', 'saved',
   'RemoExperts roles are open to verified users only: create a talent profile on rex.zone and pass the skills assessment before you can apply.',
   '["Create your talent profile on rex.zone", "List your domain strengths and experience", "Check the pay: it''s adjusted by your country of residence"]'),
  ('remoexperts', 'applied',
   'Once you''re verified, apply to the roles that match your expertise.',
   '["Watch your email, including spam, for next steps", "Keep your talent profile up to date"]'),
  ('remoexperts', 'assessment',
   'The skills assessment verifies your expertise and opens up applications.',
   '["Use a quiet room and a stable connection", "Read every instruction before you start", "Answer from your own knowledge"]'),
  ('remoexperts', 'interviewing',
   'Follow any extra steps RemoExperts sends for the role, and reply promptly.',
   '["Reply quickly to every email from RemoExperts", "Have examples of your expertise ready"]'),
  ('remoexperts', 'offered',
   'Read the project details before you start: tasks, pay and deadlines.',
   '["Confirm your rate", "Confirm the deadlines and weekly hours"]'),
  ('remoexperts', 'rejected',
   'RemoExperts posts roles across many fields, so look for others that fit.',
   '["Look for other RemoExperts roles in the feed", "Add detail about your expertise to your talent profile"]')
) as v(slug, stage, next_step, checklist) on v.slug = p.slug
on conflict (platform_id, stage) do update
set next_step = excluded.next_step,
    checklist = excluded.checklist;
