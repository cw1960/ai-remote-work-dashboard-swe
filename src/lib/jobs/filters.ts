/**
 * Feed filters live in the URL (shareable, server-rendered, work without
 * JavaScript). This module is the server boundary for them: every value is
 * validated, and anything invalid is dropped rather than failing the page.
 */
import { z } from "zod";

import {
  DOMAINS,
  type Domain,
} from "../../../supabase/functions/_shared/ingest/job";

export { DOMAINS, type Domain };

export const POSTED_WITHIN = ["1d", "7d", "30d"] as const;
export type PostedWithin = (typeof POSTED_WITHIN)[number];

export const SORTS = ["newest", "pay"] as const;
export type Sort = (typeof SORTS)[number];

export const PAGE_SIZE = 24;

export interface FeedFilters {
  q: string;
  platforms: string[];
  domains: Domain[];
  languages: string[];
  country: string | null;
  minPay: number | null;
  posted: PostedWithin | null;
  sort: Sort;
  page: number;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const language = z.string().regex(/^[a-z]{2}$/);

/** All values of a repeated or comma-separated parameter. */
function many(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((item) => item.split(",")).map((item) => item.trim());
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function valid<T>(schema: z.ZodType<T>, values: string[], limit = 20): T[] {
  const out: T[] = [];
  for (const value of values) {
    const parsed = schema.safeParse(value);
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
    if (out.length === limit) break;
  }
  return out;
}

export function parseFeedFilters(params: SearchParams): FeedFilters {
  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const country = z
    .string()
    .regex(/^[A-Z]{2}$/)
    .safeParse(first(params.country)?.toUpperCase());
  const minPay = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .safeParse(first(params.minPay));
  const posted = z.enum(POSTED_WITHIN).safeParse(first(params.posted));
  const sort = z.enum(SORTS).safeParse(first(params.sort));
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .safeParse(first(params.page));

  return {
    q,
    platforms: valid(slug, many(params.platform)),
    domains: valid(z.enum(DOMAINS), many(params.domain)),
    languages: valid(language, many(params.language)),
    country: country.success ? country.data : null,
    minPay: minPay.success ? minPay.data : null,
    posted: posted.success ? posted.data : null,
    sort: sort.success ? sort.data : "newest",
    page: page.success ? page.data : 1,
  };
}

/** The URL query for a set of filters; defaults are left out. */
export function toSearchParams(
  filters: FeedFilters,
  overrides: Partial<FeedFilters> = {},
): URLSearchParams {
  const f = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  for (const value of f.platforms) params.append("platform", value);
  for (const value of f.domains) params.append("domain", value);
  for (const value of f.languages) params.append("language", value);
  if (f.country) params.set("country", f.country);
  if (f.minPay !== null) params.set("minPay", String(f.minPay));
  if (f.posted) params.set("posted", f.posted);
  if (f.sort !== "newest") params.set("sort", f.sort);
  if (f.page > 1) params.set("page", String(f.page));
  return params;
}

/** How many filters (not search or sort) are active, for the badge. */
export function activeFilterCount(filters: FeedFilters): number {
  return (
    filters.platforms.length +
    filters.domains.length +
    filters.languages.length +
    (filters.country ? 1 : 0) +
    (filters.minPay !== null ? 1 : 0) +
    (filters.posted ? 1 : 0)
  );
}

/** The same search and sort with every filter removed, back on page 1. */
export function withoutFilters(filters: FeedFilters): FeedFilters {
  return {
    ...filters,
    platforms: [],
    domains: [],
    languages: [],
    country: null,
    minPay: null,
    posted: null,
    page: 1,
  };
}

const DAY_MS = 86_400_000;

/** Earliest posting time for a "posted within" filter. */
export function postedSince(posted: PostedWithin, now = new Date()): Date {
  const days = { "1d": 1, "7d": 7, "30d": 30 }[posted];
  return new Date(now.getTime() - days * DAY_MS);
}
