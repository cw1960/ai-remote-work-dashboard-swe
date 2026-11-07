/**
 * POST /functions/v1/job-description — the full description of a job, for
 * the resume tailor to fill in (see _shared/resume/description.ts).
 *
 * Called from the job page in the browser with the user's session (the
 * gateway verifies the JWT). Reads use the user's token, so RLS applies
 * (signed-in users only); the service role is used only to record a micro1
 * page read, which users cannot write.
 *
 * Body: { jobId: uuid }. Returns { description, source } or
 * { description: null }, or { error } with a stable code.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
 * (provided by Supabase), INGEST_USER_AGENT (the bot name and contact
 * address the ingest function also sends).
 */
import {
  handleDescriptionRequest,
  type SelectResult,
} from "../_shared/resume/description.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGE_TIMEOUT_MS = 15_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return json({ error: "method" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "not_authenticated" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid" }, 400);
  }

  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const select = async (path: string): Promise<SelectResult> => {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data };
    console.error(`select failed: ${String(response.status)}`);
    return { ok: false, status: response.status, message: "" };
  };

  const savePageDescription = async (
    jobId: string,
    content: string | null,
  ): Promise<void> => {
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const response = await fetch(`${url}/rest/v1/rpc/save_page_description`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_job_id: jobId, p_content: content }),
    });
    if (!response.ok) {
      throw new Error(`save_page_description: HTTP ${String(response.status)}`);
    }
  };

  const fetchPage = async (pageUrl: string): Promise<string> => {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": requireEnv("INGEST_USER_AGENT"),
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    return response.text();
  };

  const result = await handleDescriptionRequest(body, {
    select,
    savePageDescription,
    fetchPage,
    log: (entry) => console.log(JSON.stringify(entry)),
    now: () => Date.now(),
  });
  return json(result.body, result.status);
});
