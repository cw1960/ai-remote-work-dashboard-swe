/**
 * A deterministic check on the model's output: every employer, job title,
 * school, credential, certification, year and number in the tailored resume
 * should appear in the master resume. Anything that doesn't is returned so
 * the review screen can ask the user to verify it. This backs up the prompt's
 * no-fabrication rules; it can't prove a resume is accurate.
 */
import type { Resume } from "./schema.ts";

/** Lowercase, no accents, punctuation as spaces, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const YEAR = /\b(?:19|20)\d{2}\b/g;
// Numbers that carry meaning in a bullet (metrics, counts, percentages);
// single digits are too common to check.
const NUMBER = /\d[\d,.]*\d|\d{2,}/g;
const SIGNIFICANT_WORD = /^[\p{L}\p{N}]{4,}$/u;

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/**
 * Values in `resume` that the master resume does not contain, de-duplicated,
 * in the order they appear.
 */
export function unsupportedFacts(resume: Resume, masterText: string): string[] {
  const master = ` ${normalize(masterText)} `;
  const masterDigits = new Set(
    (masterText.match(NUMBER) ?? []).map(digitsOnly),
  );
  const found = new Set<string>();
  const missing: string[] = [];

  const flag = (value: string) => {
    const key = value.trim();
    if (key !== "" && !found.has(key)) {
      found.add(key);
      missing.push(key);
    }
  };
  const contains = (value: string) => {
    const normalized = normalize(value);
    return normalized === "" || master.includes(` ${normalized} `);
  };
  // Each phrase must appear as written (after normalizing).
  const checkPhrase = (value: string | null) => {
    if (value && !contains(value)) flag(value);
  };
  // Years must each appear; the wording around them may differ.
  const checkYears = (value: string | null) => {
    for (const year of value?.match(YEAR) ?? []) {
      if (!master.includes(` ${year} `)) flag(year);
    }
  };
  // Numbers in free text must appear in the master resume.
  const checkNumbers = (value: string) => {
    for (const number of value.match(NUMBER) ?? []) {
      if (!masterDigits.has(digitsOnly(number))) flag(number);
    }
  };
  // A skill may be reworded, but at least one of its words must appear.
  const checkSkill = (value: string) => {
    if (contains(value)) return;
    const words = normalize(value)
      .split(" ")
      .filter((word) => SIGNIFICANT_WORD.test(word));
    if (words.length === 0) return;
    if (!words.some((word) => master.includes(` ${word} `))) flag(value);
  };

  for (const job of resume.experience) {
    checkPhrase(job.employer);
    checkPhrase(job.title);
    checkYears(job.dates);
    job.bullets.forEach(checkNumbers);
  }
  for (const item of resume.education) {
    checkPhrase(item.institution);
    checkPhrase(item.credential);
    checkYears(item.dates);
  }
  resume.certifications.forEach(checkPhrase);
  resume.skills.forEach(checkSkill);
  if (resume.summary) checkNumbers(resume.summary);
  if (resume.headline) checkNumbers(resume.headline);

  return missing;
}
