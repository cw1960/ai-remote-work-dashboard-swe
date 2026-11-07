/**
 * POST /functions/v1/inbound-email — Resend's webhook for email.received.
 *
 * A user forwards a platform's email to track+<token>@<inbound domain>.
 * This function verifies Resend's signature, fetches the email's text
 * (webhooks carry only metadata), applies the auto-capture rules and
 * records the result with record_inbound_email(), which moves or creates
 * the card, or files the email under "Needs review". The email body is
 * read here and never stored.
 *
 * Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
 * RESEND_WEBHOOK_SECRET (whsec_…, required), RESEND_API_KEY (to read the
 * body; without it only the subject is used), INBOUND_DOMAIN.
 */
import { z } from "zod";

import {
  htmlToText,
  inboundToken,
  platformFor,
  type PlatformDomains,
  stageFor,
} from "../_shared/inbound/rules.ts";
import { verifyWebhook } from "../_shared/inbound/webhook.ts";

const eventSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string(),
    to: z.array(z.string()),
    cc: z.array(z.string()).nullish(),
    subject: z.string().nullish(),
  }),
});

const contentSchema = z.object({
  text: z.string().nullish(),
  html: z.string().nullish(),
});

const platformsSchema = z.array(
  z.object({ slug: z.string(), email_domains: z.array(z.string()) }),
);

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

async function supabase(path: string, init: RequestInit = {}) {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${requireEnv("SUPABASE_URL")}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `${path}: ${String(response.status)} ${await response.text()}`,
    );
  }
  return response.json() as Promise<unknown>;
}

/** The email's text, or "" if it can't be read (rules fall back to the subject). */
async function emailText(emailId: string): Promise<string> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "";
  try {
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!response.ok) {
      console.error(`email ${emailId} not read: ${String(response.status)}`);
      return "";
    }
    const content = contentSchema.parse(await response.json());
    return content.text ?? (content.html ? htmlToText(content.html) : "");
  } catch (error) {
    console.error(`email ${emailId} not read`, error);
    return "";
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method" }, 405);

  const body = await request.text();
  const genuine = await verifyWebhook(
    requireEnv("RESEND_WEBHOOK_SECRET"),
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
    Math.floor(Date.now() / 1000),
  );
  if (!genuine) return json({ error: "unauthorized" }, 401);

  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(body));
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  // Other event types may share the endpoint; acknowledge and move on.
  if (event.type !== "email.received") return json({ skipped: event.type });

  const token = inboundToken(
    [...event.data.to, ...(event.data.cc ?? [])],
    requireEnv("INBOUND_DOMAIN"),
  );
  if (!token) return json({ result: "no_token" });

  try {
    const platforms: PlatformDomains[] = platformsSchema
      .parse(
        await supabase(
          "/rest/v1/platforms?select=slug,email_domains&referral_url_template=not.is.null",
        ),
      )
      .map((p) => ({ slug: p.slug, domains: p.email_domains }));
    const subject = event.data.subject ?? "";
    const text = await emailText(event.data.email_id);
    const result = z.string().parse(
      await supabase("/rest/v1/rpc/record_inbound_email", {
        method: "POST",
        body: JSON.stringify({
          p_token: token,
          p_from: event.data.from.replace(/^.*<([^>]+)>.*$/, "$1"),
          p_subject: subject,
          p_platform: platformFor(event.data.from, text, platforms),
          p_stage: stageFor(subject, text),
        }),
      }),
    );
    return json({ result });
  } catch (error) {
    // 500 makes Resend retry the delivery later.
    console.error("inbound email not recorded", error);
    return json({ error: "failed" }, 500);
  }
});
