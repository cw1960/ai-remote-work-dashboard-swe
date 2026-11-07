import { z } from "zod";

import { siteConfig } from "@/config/site";

/**
 * Public env vars. Only these may reach the browser; Next.js inlines them at
 * build time, so each one must be referenced by its full literal name.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function getPublicEnv(): PublicEnv {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/**
 * Canonical URL of the site. NEXT_PUBLIC_SITE_URL wins; otherwise Netlify's
 * own URL variable (the site's main address, also on deploy previews), and
 * last the configured production URL.
 */
export function getSiteUrl(): URL {
  // Empty values count as unset.
  const raw = [process.env.NEXT_PUBLIC_SITE_URL, process.env.URL].find(
    (value) => value !== undefined && value !== "",
  );
  return new URL(raw ? z.url().parse(raw) : siteConfig.url);
}

const serverSchema = z.object({
  /** Unset (previews, local, CI): emails are skipped, not sent. */
  RESEND_API_KEY: z.string().startsWith("re_").optional(),
  /** "true" once Resend receiving is set up: shows forwarding addresses. */
  INBOUND_EMAIL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /**
   * Beehiiv API key and publication for newsletter signups. Production only:
   * unset (previews, local, CI), signups are skipped, not sent.
   */
  BEEHIIV_API_KEY: z.string().min(1).optional(),
  BEEHIIV_PUBLICATION_ID: z
    .string()
    .regex(/^pub_[0-9a-f-]{36}$/)
    .optional(),
  /**
   * Stripe secret (or restricted) key and webhook signing secret, for the
   * Playbook. Unset (previews, local, CI): the buy button explains that
   * checkout is unavailable.
   */
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/)
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/** Server-only env vars. Never call from client components. */
export function getServerEnv(): ServerEnv {
  return serverSchema.parse({
    RESEND_API_KEY: unsetIfEmpty(process.env.RESEND_API_KEY),
    INBOUND_EMAIL_ENABLED: unsetIfEmpty(process.env.INBOUND_EMAIL_ENABLED),
    BEEHIIV_API_KEY: unsetIfEmpty(process.env.BEEHIIV_API_KEY),
    BEEHIIV_PUBLICATION_ID: unsetIfEmpty(process.env.BEEHIIV_PUBLICATION_ID),
    STRIPE_SECRET_KEY: unsetIfEmpty(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: unsetIfEmpty(process.env.STRIPE_WEBHOOK_SECRET),
  });
}

/** Empty values count as unset. */
function unsetIfEmpty(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}
