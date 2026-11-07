import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  type FeedFilters,
  PAGE_SIZE,
  parseFeedFilters,
  postedSince,
} from "./filters";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type PlatformRow = Database["public"]["Tables"]["platforms"]["Row"];

/** One feed card: the columns selected below plus the platform. */
export type JobCardRow = Pick<
  JobRow,
  | "id"
  | "title"
  | "summary"
  | "domain"
  | "tags"
  | "pay_min"
  | "pay_max"
  | "pay_unit"
  | "languages"
  | "countries"
  | "posted_at"
> & { platform: { slug: string; name: string; has_referral: boolean } };

export const JOB_CARD_COLUMNS =
  "id, title, summary, domain, tags, pay_min, pay_max, pay_unit, languages, countries, posted_at, platform:platforms!inner(slug, name, has_referral)";

/** `%` and `_` are wildcards in ILIKE; match them literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function searchJobs(filters: FeedFilters): Promise<{
  jobs: JobCardRow[];
  total: number;
}> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("jobs")
    .select(JOB_CARD_COLUMNS, { count: "exact" })
    .eq("status", "open");

  if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
  if (filters.platforms.length > 0) {
    query = query.in("platform.slug", filters.platforms);
  }
  if (filters.domains.length > 0) query = query.in("domain", filters.domains);
  if (filters.languages.length > 0) {
    query = query.overlaps("languages", filters.languages);
  }
  if (filters.country) {
    // Open to everyone (no list) or lists the country, and doesn't exclude it.
    query = query
      .or(`countries.eq.{},countries.cs.{${filters.country}}`)
      .not("countries_blocked", "cs", `{${filters.country}}`);
  }
  if (filters.minPay !== null) {
    query = query.eq("pay_unit", "hour").gte("pay_max", filters.minPay);
  }
  if (filters.posted) {
    query = query.gte("posted_at", postedSince(filters.posted).toISOString());
  }

  query =
    filters.sort === "pay"
      ? query.order("pay_max", { ascending: false, nullsFirst: false })
      : query.order("posted_at", { ascending: false, nullsFirst: false });

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  if (!error) return { jobs: data, total: count ?? 0 };
  // Past the last page PostgREST answers 416 without a count: return an
  // empty page with the real total.
  if (error.code !== "PGRST103" || filters.page === 1) {
    throw new Error(error.message);
  }
  const { total } = await searchJobs({ ...filters, page: 1 });
  return { jobs: [], total };
}

export type JobCardData = JobCardRow;

const facetSchema = z.object({
  total: z.number(),
  platforms: z.array(
    z.object({ slug: z.string(), name: z.string(), count: z.number() }),
  ),
  domains: z.array(z.object({ value: z.string(), count: z.number() })),
  languages: z.array(z.object({ value: z.string(), count: z.number() })),
});

export type FeedFacets = z.infer<typeof facetSchema>;

export async function getFeedFacets(): Promise<FeedFacets> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("feed_facets");
  if (error) throw new Error(error.message);
  return facetSchema.parse(data);
}

/** A platform as shown on its page and on job pages. */
export type PlatformInfo = Pick<
  PlatformRow,
  | "slug"
  | "name"
  | "site_url"
  | "onboarding_notes"
  | "countries_blocked"
  | "has_referral"
>;

const PLATFORM_COLUMNS =
  "slug, name, site_url, onboarding_notes, countries_blocked, has_referral";

/** One job page: the card plus what the page and structured data need. */
export type JobDetail = Omit<JobCardRow, "platform"> &
  Pick<
    JobRow,
    "status" | "closed_at" | "first_seen_at" | "countries_blocked"
  > & { platform: PlatformInfo };

const JOB_DETAIL_COLUMNS = `id, title, summary, domain, tags, pay_min, pay_max, pay_unit, languages, countries, posted_at, status, closed_at, first_seen_at, countries_blocked, platform:platforms!inner(${PLATFORM_COLUMNS})`;

/**
 * One job, open or closed; null when the id is malformed or unknown.
 * Cached per request, so metadata and the page share one query.
 */
export const getJob = cache(async (id: string): Promise<JobDetail | null> => {
  if (!z.guid().safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});

/** Up to three open jobs like this one: same domain, else same platform. */
export async function getSimilarJobs(job: JobDetail): Promise<JobCardRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("jobs")
    .select(JOB_CARD_COLUMNS)
    .eq("status", "open")
    .neq("id", job.id);
  query = job.domain
    ? query.eq("domain", job.domain)
    : query.eq("platform.slug", job.platform.slug);
  const { data, error } = await query
    .order("posted_at", { ascending: false, nullsFirst: false })
    .order("id")
    .limit(3);
  if (error) throw new Error(error.message);
  return data;
}

/**
 * One listed platform by slug; null when the slug is malformed or unknown,
 * or the platform isn't listed (only vetted platforms are, CLAUDE.md).
 */
export const getPlatform = cache(
  async (slug: string): Promise<PlatformInfo | null> => {
    const filters = parseFeedFilters({ platform: slug });
    if (filters.platforms[0] !== slug) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("platforms")
      .select(PLATFORM_COLUMNS)
      .eq("slug", slug)
      .eq("listed", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
);

/** A platform's newest open jobs and its open-job total. */
export const getPlatformJobs = cache(async (slug: string) =>
  searchJobs(parseFeedFilters({ platform: slug })),
);

/** What /go/<job> needs to send a click on; null when unknown. */
export async function getOutboundJob(id: string) {
  if (!z.guid().safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, url, external_id, status, platform:platforms!inner(referral_url_template)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Records an outbound click (signed-in users with their id). */
export async function logOutboundClick(jobId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("log_outbound_click", {
    p_job_id: jobId,
  });
  if (error) throw new Error(error.message);
}
