/**
 * Saved searches store the feed's filters in a canonical shape (sorted
 * lists, empty values left out), so the same search saved twice is the same
 * JSON and the database's unique index catches it. Sort, page and "posted
 * within" are not saved: an alert is always about jobs new since the last
 * one. The SQL matcher (private.job_matches) reads this shape.
 */
import { z } from "zod";

import {
  DOMAINS,
  type FeedFilters,
  parseFeedFilters,
  type SearchParams,
} from "@/lib/jobs/filters";

export const FREQUENCIES = ["daily", "weekly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** At most this many saved searches per person (enforced in SQL too). */
export const MAX_SAVED_SEARCHES = 10;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const savedFiltersSchema = z.strictObject({
  q: z.string().min(1).max(100).optional(),
  platforms: z.array(slug).min(1).max(20).optional(),
  domains: z.array(z.enum(DOMAINS)).min(1).max(20).optional(),
  languages: z
    .array(z.string().regex(/^[a-z]{2}$/))
    .min(1)
    .max(20)
    .optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  minPay: z.number().int().min(1).max(10_000).optional(),
});

export type SavedFilters = z.infer<typeof savedFiltersSchema>;

const sorted = <T extends string>(values: readonly T[]): T[] | undefined =>
  values.length > 0 ? [...values].sort() : undefined;

/** The canonical saved form of a feed search. */
export function toSavedFilters(filters: FeedFilters): SavedFilters {
  const saved: SavedFilters = {};
  if (filters.q) saved.q = filters.q;
  const platforms = sorted(filters.platforms);
  if (platforms) saved.platforms = platforms;
  const domains = sorted(filters.domains);
  if (domains) saved.domains = domains;
  const languages = sorted(filters.languages);
  if (languages) saved.languages = languages;
  if (filters.country) saved.country = filters.country;
  if (filters.minPay !== null) saved.minPay = filters.minPay;
  return saved;
}

/** Feed filters (newest first, page 1) for a saved search. */
export function toFeedFilters(saved: SavedFilters): FeedFilters {
  return {
    q: saved.q ?? "",
    platforms: saved.platforms ?? [],
    domains: saved.domains ?? [],
    languages: saved.languages ?? [],
    country: saved.country ?? null,
    minPay: saved.minPay ?? null,
    posted: null,
    sort: "newest",
    page: 1,
  };
}

/** Feed filters from a query string such as "q=law&domain=law". */
export function parseFeedQuery(query: string): FeedFilters {
  const params = new URLSearchParams(query);
  const record: SearchParams = {};
  for (const key of new Set(params.keys())) record[key] = params.getAll(key);
  return parseFeedFilters(record);
}

export interface DescribeLabels {
  /** The search text, quoted: e.g. “lawyer”. */
  quoted: (q: string) => string;
  domain: (domain: (typeof DOMAINS)[number]) => string;
  language: (code: string) => string;
  country: (code: string) => string;
  minPay: (amount: number) => string;
  /** Shown when nothing narrows the search. */
  allJobs: string;
}

/** A search in words, e.g. “lawyer” · Law · Spanish · $40+/hr. */
export function describeSearch(
  saved: SavedFilters,
  platformNames: readonly string[],
  labels: DescribeLabels,
): string {
  const parts = [
    ...(saved.q ? [labels.quoted(saved.q)] : []),
    ...platformNames,
    ...(saved.domains ?? []).map(labels.domain),
    ...(saved.languages ?? []).map(labels.language),
    ...(saved.country ? [labels.country(saved.country)] : []),
    ...(saved.minPay !== undefined ? [labels.minPay(saved.minPay)] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : labels.allJobs;
}
