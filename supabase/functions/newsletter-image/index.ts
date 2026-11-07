/**
 * POST /functions/v1/newsletter-image
 *   {"date": "2026-11-06", "name": "fuse", "mime": "image/png", "data": "<base64>"}
 *
 * Stores one of a newsletter issue's AI illustrations in the public
 * `newsletter-images` bucket and returns its public URL, which the issue's
 * Beehiiv image block points at (Beehiiv's API takes images by URL only).
 *
 * Caller: the newsletter workflow (cw1960/airemoteworktoday), with its
 * token in `x-newsletter-token`, checked against Vault with
 * verify_newsletter_token(). Anyone else gets 401. Re-sending the same date
 * and name replaces the image.
 *
 * Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).
 */
import { z } from "zod";

const BUCKET = "newsletter-images";
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
/** 5 MB, the bucket's limit, as base64. */
const MAX_BASE64 = Math.ceil((5 * 1024 * 1024 * 4) / 3);

const bodySchema = z.object({
  date: z.iso.date(),
  name: z.string().regex(/^[a-z0-9-]{1,40}$/),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.base64().max(MAX_BASE64),
});

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

async function isAuthorized(req: Request): Promise<boolean> {
  const token = req.headers.get("x-newsletter-token");
  if (!token || token.length > 200) return false;
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${requireEnv("SUPABASE_URL")}/rest/v1/rpc/verify_newsletter_token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: token }),
    },
  );
  if (!response.ok) {
    console.error("token check failed", response.status);
    return false;
  }
  return z.boolean().parse(await response.json());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await isAuthorized(req))) return json({ error: "Unauthorized" }, 401);

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return json(
      {
        error:
          'Expected {"date", "name" (a-z, 0-9, -), "mime", "data" (base64, at most 5 MB)}',
      },
      400,
    );
  }
  const { date, name, mime, data } = body.data;
  const path = `${date}/${name}.${EXTENSIONS[mime]}`;
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const base = requireEnv("SUPABASE_URL");
  const upload = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": mime,
      "x-upsert": "true",
      "Cache-Control": "max-age=31536000",
    },
    body: bytes,
  });
  if (!upload.ok) {
    console.error(
      "upload failed",
      upload.status,
      (await upload.text()).slice(0, 300),
    );
    return json({ error: "Upload failed" }, 502);
  }
  return json({ url: `${base}/storage/v1/object/public/${BUCKET}/${path}` });
});
