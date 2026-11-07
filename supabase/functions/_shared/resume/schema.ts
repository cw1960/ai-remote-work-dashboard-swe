/**
 * The shape of a tailored resume, shared by the tailor-resume Edge Function
 * (the model's structured output), the app (review screen, editing,
 * downloads) and the database (tailored_resumes.content / .review).
 *
 * `outputSchema` is what the model must return. It carries no length limits
 * because structured outputs ignore them; `storedResumeSchema` adds the
 * limits and is checked before anything is saved.
 */
import { z } from "zod";

/** Limits, in characters. */
export const LIMITS = {
  /** Master resume text, after extraction (matches the database check). */
  masterMin: 200,
  masterMax: 50_000,
  /** Core skills and evidence on the master profile. */
  evidenceMax: 20_000,
  /** Job description sent for tailoring. */
  descriptionMin: 300,
  descriptionMax: 20_000,
  /** One line or bullet in a resume. */
  line: 1_000,
  /** The summary paragraph. */
  paragraph: 3_000,
  /** Items in any list. */
  items: 60,
} as const;

const experienceSchema = z.object({
  title: z.string(),
  employer: z.string(),
  location: z.string().nullable(),
  /** As written in the master resume, e.g. "Mar 2021 – Present". */
  dates: z.string().nullable(),
  bullets: z.array(z.string()),
});

const educationSchema = z.object({
  credential: z.string(),
  institution: z.string(),
  dates: z.string().nullable(),
  details: z.array(z.string()),
});

const sectionSchema = z.object({
  heading: z.string(),
  items: z.array(z.string()),
});

export const resumeSchema = z.object({
  name: z.string(),
  /** A short professional title under the name. */
  headline: z.string().nullable(),
  /** Email, phone, city, links: one per item, as in the master resume. */
  contact: z.array(z.string()),
  summary: z.string().nullable(),
  skills: z.array(z.string()),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  certifications: z.array(z.string()),
  /** Anything else in the master resume: languages, volunteering, awards. */
  other_sections: z.array(sectionSchema),
});

export const reviewSchema = z.object({
  /** The most significant changes, in plain words. */
  changes: z.array(z.string()),
  /** Qualifications from the master resume the revision puts forward. */
  emphasized: z.array(z.string()),
  /** Job requirements the master resume does not demonstrate. */
  gaps: z.array(z.string()),
  /** Ambiguous, contradictory or unverifiable details to check. */
  flags: z.array(z.string()),
});

export const outputSchema = z.object({
  resume: resumeSchema,
  review: reviewSchema,
});

export type Resume = z.infer<typeof resumeSchema>;
export type ResumeReview = z.infer<typeof reviewSchema>;
export type TailorOutput = z.infer<typeof outputSchema>;

const line = z.string().trim().max(LIMITS.line);
const lines = z.array(line.min(1)).max(LIMITS.items);
const optionalLine = line
  .nullable()
  .transform((value) => (value === "" ? null : value));

/** A resume as stored and edited: trimmed, bounded, no empty entries. */
export const storedResumeSchema = z.object({
  name: line.min(1),
  headline: optionalLine,
  contact: lines,
  summary: z
    .string()
    .trim()
    .max(LIMITS.paragraph)
    .nullable()
    .transform((value) => (value === "" ? null : value)),
  skills: lines,
  experience: z
    .array(
      z.object({
        title: line.min(1),
        employer: line.min(1),
        location: optionalLine,
        dates: optionalLine,
        bullets: lines,
      }),
    )
    .max(LIMITS.items),
  education: z
    .array(
      z.object({
        credential: line.min(1),
        institution: line.min(1),
        dates: optionalLine,
        details: lines,
      }),
    )
    .max(LIMITS.items),
  certifications: lines,
  other_sections: z
    .array(z.object({ heading: line.min(1), items: lines }))
    .max(LIMITS.items),
});

/**
 * The review as stored: the model's notes plus `unverified`, the values the
 * fact check (facts.ts) could not find in the master resume.
 */
export const storedReviewSchema = z.object({
  changes: lines,
  emphasized: lines,
  gaps: lines,
  flags: lines,
  unverified: lines.default([]),
});

export type StoredReview = z.infer<typeof storedReviewSchema>;

/** Drops empty strings and empty entries the model or an editor left. */
export function cleanResume(resume: Resume): Resume {
  const keep = (items: string[]) =>
    items.map((item) => item.trim()).filter((item) => item !== "");
  const orNull = (value: string | null) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  };
  return {
    name: resume.name.trim(),
    headline: orNull(resume.headline),
    contact: keep(resume.contact),
    summary: orNull(resume.summary),
    skills: keep(resume.skills),
    experience: resume.experience
      .map((job) => ({
        title: job.title.trim(),
        employer: job.employer.trim(),
        location: orNull(job.location),
        dates: orNull(job.dates),
        bullets: keep(job.bullets),
      }))
      .filter((job) => job.title !== "" || job.employer !== ""),
    education: resume.education
      .map((item) => ({
        credential: item.credential.trim(),
        institution: item.institution.trim(),
        dates: orNull(item.dates),
        details: keep(item.details),
      }))
      .filter((item) => item.credential !== "" || item.institution !== ""),
    certifications: keep(resume.certifications),
    other_sections: resume.other_sections
      .map((section) => ({
        heading: section.heading.trim(),
        items: keep(section.items),
      }))
      .filter((section) => section.heading !== "" && section.items.length > 0),
  };
}

/**
 * Whether a generated resume is complete enough to show: a name, and at
 * least some experience or education with content.
 */
export function isComplete(resume: Resume): boolean {
  return (
    resume.name.trim() !== "" &&
    (resume.experience.length > 0 || resume.education.length > 0) &&
    resume.experience.every(
      (job) => job.title.trim() !== "" && job.employer.trim() !== "",
    )
  );
}
