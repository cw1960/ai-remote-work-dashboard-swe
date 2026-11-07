/**
 * Mercor adapter.
 *
 * robots.txt on work.mercor.com disallows /api/, so we read the public
 * Explore page (allowed), which embeds every open listing in its Next.js
 * page data (`__NEXT_DATA__`). One request per run.
 *
 * Each listing's full description is returned separately for resume
 * tailoring; the job itself keeps a short summary.
 */
import { z } from "zod";

import { toAlpha2 } from "./countries.ts";
import {
  collect,
  DESCRIPTION_MAX_LENGTH,
  type Domain,
  type ParseResult,
  type PayUnit,
} from "./job.ts";
import { detectLanguages } from "./languages.ts";
import { cleanText, summarize, toIsoUtc } from "./text.ts";

export const MERCOR_EXPLORE_URL = "https://work.mercor.com/explore";

const DOMAIN_MAP: Readonly<Record<string, Domain>> = {
  "Arts & Design": "arts-design",
  "Business Operations": "business",
  "Data Analysis": "data",
  Finance: "finance",
  Humanities: "humanities",
  "Language and Audio": "language",
  Law: "law",
  "Life, Physical, and Social Science": "science",
  Medicine: "medicine",
  Miscellaneous: "other",
  "Other Engineering": "engineering",
  "Software Engineering": "software",
};

const PAY_UNIT_MAP: Readonly<Record<string, PayUnit>> = {
  hourly: "hour",
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
  "per-task": "task",
  "one-time": "project",
};

const codes = z.array(z.string()).nullish();

const listingSchema = z.object({
  listingId: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  status: z.string().nullish(),
  isPrivate: z.boolean().nullish(),
  rateMin: z.number().nullish(),
  rateMax: z.number().nullish(),
  payRateFrequency: z.string().nullish(),
  commitment: z.string().nullish(),
  workArrangement: z.string().nullish(),
  listingDomain: z.string().nullish(),
  postedAt: z.string().nullish(),
  createdAt: z.string().nullish(),
  eligibleLocation: codes,
  eligibleResidenceLocation: codes,
  ineligibleLocation: codes,
  ineligibleResidenceLocation: codes,
});
type Listing = z.infer<typeof listingSchema>;

const pageDataSchema = z.object({
  props: z.object({
    pageProps: z.object({
      dehydratedState: z.object({
        queries: z.array(
          z.object({
            state: z.object({ data: z.unknown() }),
          }),
        ),
      }),
    }),
  }),
});

const listingsDataSchema = z.object({ listings: z.array(z.unknown()) });

/** Thrown when the page no longer has the shape we expect (layout change). */
export class MercorLayoutError extends Error {
  override name = "MercorLayoutError";
}

/** Extracts the raw listing objects from the Explore page HTML. */
export function extractMercorListings(html: string): unknown[] {
  const match =
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (!match?.[1]) {
    throw new MercorLayoutError("Explore page has no __NEXT_DATA__ script");
  }
  const pageData = pageDataSchema.safeParse(JSON.parse(match[1]));
  if (!pageData.success) {
    throw new MercorLayoutError("Explore page data has an unexpected shape");
  }
  for (const query of pageData.data.props.pageProps.dehydratedState.queries) {
    const data = listingsDataSchema.safeParse(query.state.data);
    if (data.success) return data.data.listings;
  }
  throw new MercorLayoutError("Explore page data has no listings query");
}

function pay(listing: Listing) {
  const unit = PAY_UNIT_MAP[listing.payRateFrequency ?? ""] ?? null;
  const values = [listing.rateMin, listing.rateMax].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  if (unit === null || values.length === 0) {
    return { pay_min: null, pay_max: null, pay_unit: null };
  }
  return {
    pay_min: Math.min(...values),
    pay_max: Math.max(...values),
    pay_unit: unit,
  };
}

function toJob(listing: Listing) {
  const title = cleanText(listing.title) ?? "";
  return {
    external_id: listing.listingId,
    title,
    summary: summarize(listing.description),
    domain: DOMAIN_MAP[listing.listingDomain ?? ""] ?? "other",
    tags: [listing.commitment, listing.workArrangement].filter(
      (tag): tag is string => !!tag,
    ),
    ...pay(listing),
    languages: detectLanguages(title),
    countries: toAlpha2([
      ...(listing.eligibleLocation ?? []),
      ...(listing.eligibleResidenceLocation ?? []),
    ]),
    countries_blocked: toAlpha2([
      ...(listing.ineligibleLocation ?? []),
      ...(listing.ineligibleResidenceLocation ?? []),
    ]),
    url: `https://work.mercor.com/jobs/${encodeURIComponent(listing.listingId)}`,
    posted_at: toIsoUtc(listing.postedAt ?? listing.createdAt),
  };
}

/** Maps the Explore page to jobs. Only active, public listings are kept. */
export function parseMercorExplorePage(html: string): ParseResult {
  const candidates: unknown[] = [];
  const texts = new Map<string, string>();
  let skipped = 0;
  for (const raw of extractMercorListings(html)) {
    const listing = listingSchema.safeParse(raw);
    if (!listing.success) {
      skipped += 1;
      continue;
    }
    if (listing.data.status !== "active" || listing.data.isPrivate === true) {
      continue;
    }
    candidates.push(toJob(listing.data));
    const text = listing.data.description?.trim();
    if (text) {
      texts.set(listing.data.listingId, text.slice(0, DESCRIPTION_MAX_LENGTH));
    }
  }
  const result = collect(candidates);
  const descriptions: Record<string, string> = {};
  for (const job of result.jobs) {
    const text = texts.get(job.external_id);
    if (text) descriptions[job.external_id] = text;
  }
  return { jobs: result.jobs, skipped: result.skipped + skipped, descriptions };
}
