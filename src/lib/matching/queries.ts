import "server-only";

import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { JOB_CARD_COLUMNS, type JobCardRow } from "@/lib/jobs/queries";
import { hasReasons, type MatchReasons } from "@/lib/matching/reasons";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Matching is an extra: if it fails (e.g. a deploy ran before its migration),
 * the dashboard and feed still render, just without matches.
 */
function matchingFailed(message: string) {
  console.error(`match_jobs failed: ${message}`);
}

const rowSchema = z.object({
  job_id: z.string(),
  score: z.number(),
  matched_domain: z.string().nullable(),
  matched_languages: z.array(z.string()).nullable(),
  pay_ok: z.boolean().nullable(),
  country_ok: z.string().nullable(),
});

function toReasons(row: z.infer<typeof rowSchema>): MatchReasons {
  return {
    domain: row.matched_domain,
    languages: row.matched_languages ?? [],
    payOk: row.pay_ok === true,
    country: row.country_ok,
  };
}

export interface MatchedJob {
  job: JobCardRow;
  reasons: MatchReasons;
}

/** The signed-in user's best-matching open jobs, best first. */
export async function getMatchedJobs(limit: number): Promise<MatchedJob[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("match_jobs", {
    p_user_id: user.id,
    p_limit: limit,
  });
  if (error) {
    matchingFailed(error.message);
    return [];
  }
  const rows = z
    .array(rowSchema)
    .parse(data)
    .filter((row) => hasReasons(toReasons(row)));
  if (rows.length === 0) return [];

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select(JOB_CARD_COLUMNS)
    .in(
      "id",
      rows.map((row) => row.job_id),
    );
  if (jobsError) throw new Error(jobsError.message);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  return rows.flatMap((row) => {
    const job = byId.get(row.job_id);
    return job ? [{ job, reasons: toReasons(row) }] : [];
  });
}

/**
 * How many of the user's matches (among their best 100) were first seen
 * after `since`: the Today panel's "new matches since your last visit".
 */
export async function countNewMatches(since: string): Promise<number> {
  const user = await getSessionUser();
  if (!user) return 0;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("match_jobs", {
    p_user_id: user.id,
    p_limit: 100,
  });
  if (error) {
    matchingFailed(error.message);
    return 0;
  }
  const ids = z
    .array(rowSchema)
    .parse(data)
    .filter((row) => hasReasons(toReasons(row)))
    .map((row) => row.job_id);
  if (ids.length === 0) return 0;

  const { count, error: countError } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("id", ids)
    .gt("first_seen_at", since);
  if (countError) throw new Error(countError.message);
  return count ?? 0;
}

/**
 * Match reasons for jobs on a page (the feed), for the signed-in user.
 * Empty when signed out; jobs without reasons are left out.
 */
export async function getMatchReasons(
  jobIds: readonly string[],
): Promise<Map<string, MatchReasons>> {
  const user = await getSessionUser();
  if (!user || jobIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("match_jobs", {
    p_user_id: user.id,
    p_job_ids: [...jobIds],
  });
  if (error) {
    matchingFailed(error.message);
    return new Map();
  }
  return new Map(
    z
      .array(rowSchema)
      .parse(data)
      .map((row) => [row.job_id, toReasons(row)] as const)
      .filter(([, reasons]) => hasReasons(reasons)),
  );
}

/** Whether the profile has what matching needs (a field or a language). */
export async function profileCanMatch(): Promise<boolean | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("domains, languages")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(
    data && (data.domains.length > 0 || data.languages.length > 0),
  );
}
