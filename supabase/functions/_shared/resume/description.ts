/**
 * The job-description request flow, kept free of Deno so it can be tested:
 * the full description of a job, for the tailor dialog to fill in.
 *
 *   * A stored description (Mercor's, from ingestion; or a micro1 page read
 *     earlier) is returned as is.
 *   * An open micro1 job without one: its page is read once and the result
 *     recorded, including "no description", which is retried after a day.
 *   * Anything else: null, and the user pastes the description.
 *
 * Reads run as the signed-in user (only signed-in users may read
 * descriptions); only recording a page read uses the service role. Logs
 * carry ids and outcomes, never description text.
 */
import { z } from "zod";

import { micro1JobPageUrl, parseMicro1JobPage } from "../ingest/micro1-page.ts";

/** A PostgREST answer (same shape as the tailor handler's RpcResult). */
export type SelectResult =
  { ok: true; data: unknown } | { ok: false; status: number; message: string };

export interface DescriptionDeps {
  /** GET /rest/v1/<path> as the signed-in user. */
  select(path: string): Promise<SelectResult>;
  /** Records a page read (service role). */
  savePageDescription(jobId: string, content: string | null): Promise<void>;
  /** The page's HTML; throws on a network error or a non-2xx answer. */
  fetchPage(url: string): Promise<string>;
  log(entry: Record<string, unknown>): void;
  now(): number;
}

export type DescriptionSource = "feed" | "page";

export interface DescriptionResponse {
  status: number;
  body:
    | { description: string; source: DescriptionSource }
    | { description: null }
    | { error: "invalid" | "not_authenticated" | "job_not_found" | "failed" };
}

/** A page read that found nothing is retried after this long. */
export const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

const requestSchema = z.object({ jobId: z.guid() });

const storedSchema = z.array(
  z.object({
    content: z.string().nullable(),
    source: z.enum(["feed", "page"]),
    fetched_at: z.string(),
  }),
);

const jobSchema = z.array(
  z.object({
    external_id: z.string(),
    status: z.string(),
    platforms: z.object({ slug: z.string() }),
  }),
);

function failed(result: SelectResult): DescriptionResponse {
  return !result.ok && result.status === 401
    ? { status: 401, body: { error: "not_authenticated" } }
    : { status: 500, body: { error: "failed" } };
}

export async function handleDescriptionRequest(
  rawBody: unknown,
  deps: DescriptionDeps,
): Promise<DescriptionResponse> {
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) return { status: 400, body: { error: "invalid" } };
  const { jobId } = parsed.data;

  const stored = await deps.select(
    `job_descriptions?job_id=eq.${jobId}&select=content,source,fetched_at`,
  );
  if (!stored.ok) return failed(stored);
  const rows = storedSchema.safeParse(stored.data);
  if (!rows.success) return { status: 500, body: { error: "failed" } };
  const row = rows.data[0];
  if (row?.content) {
    deps.log({ event: "job_description", jobId, outcome: "stored" });
    return {
      status: 200,
      body: { description: row.content, source: row.source },
    };
  }

  const jobResult = await deps.select(
    `jobs?id=eq.${jobId}&select=external_id,status,platforms(slug)`,
  );
  if (!jobResult.ok) return failed(jobResult);
  const jobs = jobSchema.safeParse(jobResult.data);
  if (!jobs.success) return { status: 500, body: { error: "failed" } };
  const job = jobs.data[0];
  if (!job) return { status: 404, body: { error: "job_not_found" } };

  const readRecently =
    row !== undefined &&
    deps.now() - Date.parse(row.fetched_at) < RETRY_AFTER_MS;
  if (
    job.platforms.slug !== "micro1" ||
    job.status !== "open" ||
    readRecently
  ) {
    deps.log({ event: "job_description", jobId, outcome: "none" });
    return { status: 200, body: { description: null } };
  }

  let content: string | null = null;
  let outcome = "page";
  try {
    content = parseMicro1JobPage(
      await deps.fetchPage(micro1JobPageUrl(job.external_id)),
    );
    if (!content) outcome = "page_empty";
  } catch (error) {
    outcome = "page_error";
    deps.log({
      event: "job_description",
      jobId,
      outcome,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }
  try {
    // Recorded either way, so a page is read at most once a day.
    await deps.savePageDescription(jobId, content);
  } catch (error) {
    deps.log({
      event: "job_description",
      jobId,
      outcome: "save_error",
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }
  if (outcome !== "page_error") {
    deps.log({ event: "job_description", jobId, outcome });
  }
  return content
    ? { status: 200, body: { description: content, source: "page" } }
    : { status: 200, body: { description: null } };
}
