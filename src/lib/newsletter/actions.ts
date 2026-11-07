"use server";

import { headers } from "next/headers";

import { getServerEnv } from "@/lib/env";
import { isPreviewHost } from "@/lib/jobs/outbound";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

import { createBeehiivSubscription } from "./beehiiv";
import { type SignupInput, signupSchema } from "./signup";

export type SignupResult =
  { ok: true } | { ok: false; reason: "invalid" | "failed" };

/**
 * Subscribes an email to the newsletter from a form on this site, then
 * counts the signup (source and campaign only, no personal data).
 *
 * Deploy previews share the production database and have no Beehiiv key, so
 * they do neither; without a key (local, CI) only the count is recorded.
 */
export async function subscribeToNewsletter(
  input: unknown,
): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const signup = parsed.data;
  // A filled-in honeypot is a bot: look successful, do nothing.
  if (signup.website !== "") return { ok: true };

  const request = await headers();
  const host = request.get("x-forwarded-host") ?? request.get("host");
  if (isPreviewHost(host)) return { ok: true };

  const env = getServerEnv();
  if (env.BEEHIIV_API_KEY && env.BEEHIIV_PUBLICATION_ID) {
    const subscribed = await createBeehiivSubscription(signup, {
      apiKey: env.BEEHIIV_API_KEY,
      publicationId: env.BEEHIIV_PUBLICATION_ID,
    });
    if (!subscribed) return { ok: false, reason: "failed" };
  } else {
    console.warn("newsletter signup skipped: Beehiiv is not configured");
  }

  await logSignup(signup);
  return { ok: true };
}

/** A failed count never fails the signup itself. */
async function logSignup(signup: SignupInput): Promise<void> {
  const supabase = createSupabaseAnonClient();
  const { error } = await supabase.rpc("log_site_event", {
    p_event: "newsletter_signup",
    p_source: signup.source,
    // The function stores an empty tag as null.
    p_utm_source: signup.utm.source ?? "",
    p_utm_medium: signup.utm.medium ?? "",
    p_utm_campaign: signup.utm.campaign ?? "",
  });
  if (error) console.error("newsletter signup not counted", error);
}
