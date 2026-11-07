/**
 * The shape every adapter produces, validated with the same limits as the
 * `jobs` table so one bad listing is skipped instead of failing a whole run.
 *
 * Pure TypeScript: runs in Deno (Edge Functions) and Node (Vitest).
 */
import { z } from "zod";

/** Shared domain taxonomy for the feed filters. Adapters map onto these. */
export const DOMAINS = [
  "software",
  "ai-ml",
  "data",
  "engineering",
  "robotics",
  "science",
  "medicine",
  "law",
  "finance",
  "business",
  "sales-marketing",
  "language",
  "humanities",
  "arts-design",
  "education",
  "trades",
  "generalist",
  "other",
] as const;
export type Domain = (typeof DOMAINS)[number];

/** Mirrors the `pay_unit` enum. */
export const PAY_UNITS = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "task",
  "session",
  "project",
] as const;
export type PayUnit = (typeof PAY_UNITS)[number];

const countryCode = z.string().regex(/^[A-Z]{2}$/);
const languageCode = z.string().regex(/^[a-z]{2}$/);

export const jobInputSchema = z
  .object({
    external_id: z.string().min(1).max(200),
    title: z.string().min(1).max(300),
    summary: z.string().max(500).nullable(),
    domain: z.enum(DOMAINS),
    tags: z.array(z.string().min(1).max(60)).max(12),
    pay_min: z.number().nonnegative().max(99_999_999).nullable(),
    pay_max: z.number().nonnegative().max(99_999_999).nullable(),
    pay_unit: z.enum(PAY_UNITS).nullable(),
    languages: z.array(languageCode),
    countries: z.array(countryCode),
    countries_blocked: z.array(countryCode),
    url: z
      .string()
      .regex(/^https:\/\//)
      .max(2000),
    posted_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine(
    (job) =>
      job.pay_min === null ||
      job.pay_max === null ||
      job.pay_min <= job.pay_max,
    { message: "pay_min exceeds pay_max" },
  );

export type JobInput = z.infer<typeof jobInputSchema>;

/** What an adapter hands back for one fetched page or payload. */
export interface ParseResult {
  jobs: JobInput[];
  /** Listings that could not be mapped or failed validation. */
  skipped: number;
  /**
   * Full descriptions by external id, for resume tailoring only (stored
   * apart from the job and never shown on the site). Only sources whose
   * feed already carries them fill this in.
   */
  descriptions?: Record<string, string>;
}

/** Longest description kept (job_descriptions.content). */
export const DESCRIPTION_MAX_LENGTH = 20_000;

/**
 * Validates mapped listings, dropping (and counting) invalid ones and
 * duplicate external ids.
 */
export function collect(candidates: readonly unknown[]): ParseResult {
  const jobs: JobInput[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const candidate of candidates) {
    const parsed = jobInputSchema.safeParse(candidate);
    if (!parsed.success || seen.has(parsed.data.external_id)) {
      skipped += 1;
      continue;
    }
    seen.add(parsed.data.external_id);
    jobs.push(parsed.data);
  }
  return { jobs, skipped };
}
