/**
 * POST /functions/v1/tailor-resume — tailors the signed-in user's master
 * resume to a job and stores the result as a draft for review.
 *
 * Called from the job page in the browser with the user's session (the
 * gateway verifies the JWT). It runs here rather than in the Next.js app
 * because a generation can take longer than a Netlify function may run.
 * Database calls use the user's token, so RLS and the functions' own checks
 * apply; the service role is never used.
 *
 * Body: { jobId: uuid, jobDescription: string }.
 * Returns { id } of the new draft, or { error } with a stable code.
 *
 * Env: SUPABASE_URL and SUPABASE_ANON_KEY (provided by Supabase),
 * ANTHROPIC_API_KEY (without it every request answers "not_configured").
 */
import Anthropic from "@anthropic-ai/sdk";

import {
  handleTailorRequest,
  type RpcResult,
} from "../_shared/resume/handler.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  const rpc = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<RpcResult> => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data };
    const message =
      data && typeof data === "object" && "message" in data
        ? String(data.message)
        : "";
    console.error(`rpc ${name} failed: ${String(response.status)}`);
    return { ok: false, status: response.status, message };
  };

  const result = await handleTailorRequest(body, {
    rpc,
    client: apiKey
      ? new Anthropic({ apiKey, timeout: 110_000, maxRetries: 1 })
      : null,
    log: (entry) => console.log(JSON.stringify(entry)),
    now: () => Date.now(),
  });
  return json(result.body, result.status);
});
