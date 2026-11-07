/**
 * micro1 adapter.
 *
 * The public opportunities page (www.micro1.ai/experts/opportunities) loads
 * its listings from prod-api.micro1.ai (no robots.txt there; the site's
 * robots.txt allows everything). The endpoint caps a page at 100 listings,
 * so a run reads the pages in order, a few seconds apart.
 */
import { z } from "zod";

import { collect, type Domain, type ParseResult, type PayUnit } from "./job.ts";
import { detectLanguages } from "./languages.ts";
import { cleanText, toIsoUtc } from "./text.ts";

export const MICRO1_PORTAL_URL = "https://prod-api.micro1.ai/api/v1/job/portal";
export const MICRO1_PAGE_SIZE = 100;
/** Hard cap on pages per run (500 listings); micro1 lists ~320 today. */
export const MICRO1_MAX_PAGES = 5;

/** The request the opportunities page itself sends. */
export function micro1PageRequest(page: number): {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
} {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(MICRO1_PAGE_SIZE),
    keyword: "",
  });
  return {
    url: `${MICRO1_PORTAL_URL}?${query.toString()}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get_all_jobs",
        filters: { type: ["EXPERT"] },
      }),
    },
  };
}

const DOMAIN_MAP: Readonly<Record<string, Domain>> = {
  "ai-machine-learning": "ai-ml",
  "applied-engineering": "engineering",
  "arts-design": "arts-design",
  "business-operations": "business",
  cybersecurity: "software",
  "data-analysis": "data",
  education: "education",
  finance: "finance",
  generalist: "generalist",
  humanities: "humanities",
  "language-audio": "language",
  law: "law",
  medicine: "medicine",
  other: "other",
  "retail-hospitality": "business",
  robotics: "robotics",
  "sales-marketing": "sales-marketing",
  "sciences-research": "science",
  "skilled-trades-construction": "trades",
  "software-engineering": "software",
};

/** Amounts arrive as numbers or as decimal strings ("2000.00"). */
const amount = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .nullish();

const range = z.object({ min: amount, max: amount }).nullish();

const jobSchema = z.object({
  job_id: z.string(),
  job_name: z.string(),
  apply_url: z.string().nullish(),
  date_posted: z.string().nullish(),
  domain_slug: z.string().nullish(),
  role_type: z.string().nullish(),
  engagement_type: z.string().nullish(),
  skills: z.array(z.string()).nullish(),
  ideal_hourly_rate: range,
  ideal_monthly_salary_min: amount,
  ideal_monthly_salary_max: amount,
  ideal_yearly_compensation: z.unknown().optional(),
});
type Micro1Job = z.infer<typeof jobSchema>;

const pageSchema = z.object({
  status: z.literal(true),
  total: z.number().int().nonnegative(),
  data: z.array(z.unknown()),
});

/** Thrown when the endpoint answers with an unexpected shape. */
export class Micro1FormatError extends Error {
  override name = "Micro1FormatError";
}

function payFrom(
  min: number | null | undefined,
  max: number | null | undefined,
  unit: PayUnit,
) {
  const values = [min, max].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  if (values.length === 0) return null;
  return {
    pay_min: Math.min(...values),
    pay_max: Math.max(...values),
    pay_unit: unit,
  };
}

function pay(job: Micro1Job) {
  const yearly = range.safeParse(job.ideal_yearly_compensation);
  return (
    payFrom(job.ideal_hourly_rate?.min, job.ideal_hourly_rate?.max, "hour") ??
    payFrom(
      job.ideal_monthly_salary_min,
      job.ideal_monthly_salary_max,
      "month",
    ) ??
    (yearly.success
      ? payFrom(yearly.data?.min, yearly.data?.max, "year")
      : null) ?? { pay_min: null, pay_max: null, pay_unit: null }
  );
}

function url(job: Micro1Job): string {
  // Canonical listing page, without micro1's own tracking parameters.
  const fallback = `https://jobs.micro1.ai/post/${encodeURIComponent(job.job_id)}`;
  if (!job.apply_url) return fallback;
  try {
    const parsed = new URL(job.apply_url);
    if (parsed.protocol !== "https:") return fallback;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return fallback;
  }
}

function toJob(job: Micro1Job) {
  const title = cleanText(job.job_name) ?? "";
  const skills = (job.skills ?? [])
    .map(cleanText)
    .filter((skill): skill is string => skill !== null && skill.length <= 60);
  return {
    external_id: job.job_id,
    title,
    summary: null,
    domain: DOMAIN_MAP[job.domain_slug ?? ""] ?? "other",
    tags: [job.role_type, job.engagement_type, ...skills.slice(0, 5)].filter(
      (tag): tag is string => !!tag,
    ),
    ...pay(job),
    languages: detectLanguages(title, ...skills),
    countries: [],
    countries_blocked: [],
    url: url(job),
    posted_at: toIsoUtc(job.date_posted),
  };
}

/** One page of the portal response: its jobs and the total listed. */
export function parseMicro1Page(
  body: unknown,
): ParseResult & { total: number } {
  const page = pageSchema.safeParse(body);
  if (!page.success) {
    throw new Micro1FormatError("Job portal response has an unexpected shape");
  }
  const candidates: unknown[] = [];
  let skipped = 0;
  for (const raw of page.data.data) {
    const job = jobSchema.safeParse(raw);
    if (job.success) candidates.push(toJob(job.data));
    else skipped += 1;
  }
  const result = collect(candidates);
  return {
    jobs: result.jobs,
    skipped: result.skipped + skipped,
    total: page.data.total,
  };
}

/** Pages to request for a given total, within the per-run cap. */
export function micro1PageCount(total: number): number {
  return Math.min(Math.ceil(total / MICRO1_PAGE_SIZE), MICRO1_MAX_PAGES);
}
