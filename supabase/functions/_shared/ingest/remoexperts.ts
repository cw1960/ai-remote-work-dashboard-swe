/**
 * RemoExperts adapter (newsletter-only source).
 *
 * The public Open Opportunities page (www.rex.zone/open-opportunities)
 * loads every open role from one JSON endpoint on the same site. Vetted
 * 2026-10-02: robots.txt allows everything and the site has no terms page.
 * One request per run.
 */
import { z } from "zod";

import { countriesFromLocation } from "./countries.ts";
import { classifyDomain } from "./domains.ts";
import { collect, type Domain, type ParseResult } from "./job.ts";
import { detectLanguages } from "./languages.ts";
import { cleanText, parseHourlyPay, summarize } from "./text.ts";

export const REMOEXPERTS_OPPORTUNITIES_URL =
  "https://www.rex.zone/get-open-opportunities";
const OPPORTUNITY_URL = "https://www.rex.zone/open-opportunities/";

// The publisher (a staff member's name) and application fields are left
// out: we don't store them.
const opportunitySchema = z.object({
  jobId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  jobTitle: z.string(),
  jobCategory: z.array(z.string()).nullish(),
  jobDescription: z.string().nullish(),
  compensation: z.string().nullish(),
  countries: z.array(z.string()).nullish(),
  publishTime: z.string().nullish(),
});
type Opportunity = z.infer<typeof opportunitySchema>;

/** Thrown when the endpoint no longer answers with a list. */
export class RemoExpertsFormatError extends Error {
  override name = "RemoExpertsFormatError";
}

/** Used when the title alone doesn't place the role. */
const CATEGORY_DOMAINS: Readonly<Record<string, Domain>> = {
  ARTS_DESIGN: "arts-design",
  COMPUTER_SCIENCE: "software",
  ENGINEERING: "engineering",
  FINANCE: "finance",
  GENERAL: "generalist",
  LAW: "law",
  LIFE_SCIENCE: "science",
  MATHEMATICS_STATISTICS: "science",
  MEDICAL_SCIENCE: "medicine",
  PHYSICAL_SCIENCE: "science",
};

/** "COMPUTER_SCIENCE" → "Computer Science". */
function categoryLabel(category: string): string | null {
  return cleanText(
    category
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  );
}

/**
 * Hourly pay from the compensation line. Ranges often drop the second
 * dollar sign ("USD $50–120 per hour"); "Up to $125 per hour" is a
 * maximum only.
 */
function pay(compensation: string | null | undefined) {
  const text = (compensation ?? "").replace(
    /(\$\s?\d[\d,.]*)\s*(-|–|—|to)\s*(?=\d)/i,
    "$1 $2 $$",
  );
  const parsed = parseHourlyPay(text);
  return /\bup to\b/i.test(text) && parsed.pay_max !== null
    ? { ...parsed, pay_min: null }
    : parsed;
}

/** Country names, one per entry; "ALL" means open to everyone. */
function countries(names: readonly string[] | null | undefined): string[] {
  const list = names ?? [];
  if (list.length === 0 || list.some((name) => name.toUpperCase() === "ALL")) {
    return [];
  }
  const codes = new Set<string>();
  for (const name of list) {
    // Official names such as "Venezuela, Bolivarian Republic of".
    const found = countriesFromLocation(name.split(",")[0])[0];
    if (found) codes.add(found);
  }
  return [...codes].sort();
}

function toJob(opportunity: Opportunity) {
  const title = cleanText(opportunity.jobTitle) ?? "";
  const languages = detectLanguages(title);
  const categories = opportunity.jobCategory ?? [];
  const byTitle = classifyDomain(title, languages);
  const byCategory = categories
    .map((category) => CATEGORY_DOMAINS[category])
    .find((domain) => domain !== undefined);
  const posted = opportunity.publishTime
    ? new Date(opportunity.publishTime)
    : null;
  return {
    external_id: opportunity.jobId,
    title,
    summary: summarize(opportunity.jobDescription),
    domain: byTitle === "other" ? (byCategory ?? "other") : byTitle,
    tags: categories
      .map(categoryLabel)
      .filter((tag): tag is string => tag !== null && tag.length <= 60),
    ...pay(opportunity.compensation),
    languages,
    countries: countries(opportunity.countries),
    countries_blocked: [],
    url: `${OPPORTUNITY_URL}${encodeURIComponent(opportunity.jobId)}`,
    posted_at:
      posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : null,
  };
}

/** Maps the endpoint's answer to jobs. */
export function parseRemoExpertsOpportunities(json: unknown): ParseResult {
  const list = z.array(z.unknown()).safeParse(json);
  if (!list.success) {
    throw new RemoExpertsFormatError(
      "RemoExperts opportunities have an unexpected shape",
    );
  }
  const candidates: unknown[] = [];
  let skipped = 0;
  for (const raw of list.data) {
    const opportunity = opportunitySchema.safeParse(raw);
    if (!opportunity.success) {
      skipped += 1;
      continue;
    }
    candidates.push(toJob(opportunity.data));
  }
  const result = collect(candidates);
  return { jobs: result.jobs, skipped: result.skipped + skipped };
}
