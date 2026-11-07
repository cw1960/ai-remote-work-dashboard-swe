/**
 * POST /functions/v1/ingest  {"platform": "<slug>"} (see SOURCE_SLUGS)
 *
 * Fetches one platform's listings and stores them through ingest_jobs(),
 * which logs the run and applies the closing rule. A failed run emails
 * ALERT_EMAIL. Full descriptions a source returns (Mercor) are then stored
 * with store_job_descriptions(), for resume tailoring only.
 *
 * Callers: pg_cron (header `x-ingest-token`, checked against Vault with
 * verify_ingest_token) or an admin with the service role key. Anyone else
 * gets 401.
 *
 * Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
 * INGEST_USER_AGENT (bot name, site URL and contact email), RESEND_API_KEY
 * and ALERT_EMAIL (optional; without them failures are only logged),
 * ALERT_FROM (optional sender). See .env.example.
 */
import { z } from "zod";

import { DEFAULT_ALERT_FROM, sendAlert } from "../_shared/ingest/alert.ts";
import {
  SOURCE_SLUGS,
  SOURCES,
  type SourceResult,
} from "../_shared/ingest/sources.ts";

const bodySchema = z.object({ platform: z.enum(SOURCE_SLUGS) });

const runSummarySchema = z.object({
  run_id: z.number(),
  found: z.number(),
  inserted: z.number(),
  updated: z.number(),
  closed: z.number(),
  skipped: z.number(),
  error: z.string().nullable(),
});
type RunSummary = z.infer<typeof runSummarySchema>;

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Compares secrets without leaking their length or content via timing. */
function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function describe(error: unknown): string {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 500);
}

/** Calls a database function through PostgREST with the service role. */
async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${requireEnv("SUPABASE_URL")}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(args),
    },
  );
  if (!response.ok) {
    throw new Error(
      `${name} failed: HTTP ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
}

async function storeRun(args: {
  platform: string;
  startedAt: string;
  result: SourceResult | null;
  error: string | null;
}): Promise<RunSummary> {
  return runSummarySchema.parse(
    await rpc("ingest_jobs", {
      p_platform: args.platform,
      p_started_at: args.startedAt,
      p_jobs: args.result?.jobs ?? [],
      p_skipped: args.result?.skipped ?? 0,
      p_error: args.error,
    }),
  );
}

async function isAuthorized(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (serviceKey !== "" && safeEqual(auth, `Bearer ${serviceKey}`)) return true;

  const token = req.headers.get("x-ingest-token");
  if (!token || token.length > 200) return false;
  try {
    return z
      .boolean()
      .parse(await rpc("verify_ingest_token", { p_token: token }));
  } catch (caught) {
    console.error("token check failed", describe(caught));
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!(await isAuthorized(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return json(
      {
        error: 'Expected {"platform": one of ' + SOURCE_SLUGS.join(", ") + "}",
      },
      400,
    );
  }
  const { platform } = body.data;
  const startedAt = new Date().toISOString();

  let result: SourceResult | null = null;
  let error: string | null = null;
  try {
    result = await SOURCES[platform]({
      fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      userAgent: requireEnv("INGEST_USER_AGENT"),
    });
  } catch (caught) {
    error = describe(caught);
  }

  let summary: RunSummary;
  try {
    summary = await storeRun({ platform, startedAt, result, error });
  } catch (caught) {
    // Storing failed (e.g. a listing broke a constraint): log a failed run
    // so nothing is closed and the alert fires.
    summary = await storeRun({
      platform,
      startedAt,
      result: null,
      error: describe(caught),
    });
  }

  // Full descriptions for resume tailoring. Best effort: a failure here is
  // logged and never fails the run.
  const descriptions = Object.entries(result?.descriptions ?? {});
  let descriptionsStored: number | null = null;
  if (!summary.error && descriptions.length > 0) {
    try {
      descriptionsStored = z.number().parse(
        await rpc("store_job_descriptions", {
          p_platform: platform,
          p_descriptions: descriptions.map(([external_id, content]) => ({
            external_id,
            content,
          })),
        }),
      );
    } catch (caught) {
      console.error("storing descriptions failed", describe(caught));
    }
  }

  const report = {
    platform,
    requests: result?.requests ?? 0,
    ...summary,
    descriptions_stored: descriptionsStored,
  };
  if (summary.error) {
    console.error("ingest failed", report);
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const to = Deno.env.get("ALERT_EMAIL");
    if (apiKey && to) {
      const from = Deno.env.get("ALERT_FROM") ?? DEFAULT_ALERT_FROM;
      await sendAlert(fetch, { apiKey, to, from }, report).catch((caught) =>
        console.error("alert email failed", describe(caught)),
      );
    } else {
      console.warn("RESEND_API_KEY or ALERT_EMAIL not set; no alert sent");
    }
  }
  return json(report, summary.error ? 502 : 200);
});
