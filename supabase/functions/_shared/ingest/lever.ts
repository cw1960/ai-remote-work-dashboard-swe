/**
 * Lever job boards (official, public Postings API).
 *
 * One request per run: GET /v0/postings/<site>?mode=json returns every
 * open posting. A site can mix AI-training work with other teams, so each
 * site has an `include` filter.
 */
import { z } from "zod";

import { countriesFromLocation } from "./countries.ts";
import { classifyDomain } from "./domains.ts";
import { collect, type ParseResult } from "./job.ts";
import { detectLanguages } from "./languages.ts";
import { cleanText, parseHourlyPay, summarize } from "./text.ts";

const postingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  createdAt: z.number().nullish(),
  country: z.string().nullish(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  additionalPlain: z.string().nullish(),
  categories: z
    .object({
      commitment: z.string().nullish(),
      department: z.string().nullish(),
      team: z.string().nullish(),
      location: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
});
export type LeverPosting = z.infer<typeof postingSchema>;

export interface LeverSite {
  /** The site name in jobs.lever.co/<site>. */
  site: string;
  include: (posting: LeverPosting) => boolean;
}

/** Sites we read, keyed by `platforms.slug`. */
export const LEVER_SITES = {
  // Welo Data's AI work is one department of the Welocalize group's site;
  // the rest is translation agency work. Onsite roles are left out.
  "welo-data": {
    site: "weloglobal",
    include: (posting: LeverPosting) =>
      posting.categories?.department === "Welo Data - AI Services" &&
      posting.workplaceType !== "onsite",
  },
} as const satisfies Record<string, LeverSite>;

export function leverPostingsUrl(site: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;
}

/** Thrown when the API answer no longer has the documented shape. */
export class LeverFormatError extends Error {
  override name = "LeverFormatError";
}

function countries(posting: LeverPosting): string[] {
  const code = posting.country?.trim().toUpperCase();
  if (code && /^[A-Z]{2}$/.test(code)) return [code];
  const locations = posting.categories?.allLocations ?? [];
  return countriesFromLocation(
    locations.length > 0 ? locations.join(";") : posting.categories?.location,
  );
}

function toJob(posting: LeverPosting) {
  // Titles can carry a translated suffix after " | " and a leading "*"
  // marker; keep the plain first part.
  const title =
    cleanText(posting.text.split(" | ")[0]?.replace(/^\*+\s*/, "")) ?? "";
  const languages = detectLanguages(title);
  const created =
    typeof posting.createdAt === "number"
      ? new Date(posting.createdAt).toISOString()
      : null;
  return {
    external_id: posting.id,
    title,
    summary: summarize(posting.descriptionPlain),
    domain: classifyDomain(title, languages),
    tags: [posting.categories?.team, posting.categories?.commitment]
      .map((tag) => cleanText(tag))
      .filter((tag): tag is string => tag !== null && tag.length <= 60),
    ...parseHourlyPay(
      `${posting.descriptionPlain ?? ""}\n${posting.additionalPlain ?? ""}`,
    ),
    languages,
    countries: countries(posting),
    countries_blocked: [],
    url: posting.hostedUrl,
    posted_at: created,
  };
}

/** Maps a site's API answer to jobs, keeping only the site's AI roles. */
export function parseLeverPostings(
  json: unknown,
  config: LeverSite,
): ParseResult {
  const postings = z.array(z.unknown()).safeParse(json);
  if (!postings.success) {
    throw new LeverFormatError(
      `Lever site ${config.site} has an unexpected shape`,
    );
  }
  const candidates: unknown[] = [];
  let skipped = 0;
  for (const raw of postings.data) {
    const posting = postingSchema.safeParse(raw);
    if (!posting.success) {
      skipped += 1;
      continue;
    }
    if (!config.include(posting.data)) continue;
    candidates.push(toJob(posting.data));
  }
  const result = collect(candidates);
  return { jobs: result.jobs, skipped: result.skipped + skipped };
}
