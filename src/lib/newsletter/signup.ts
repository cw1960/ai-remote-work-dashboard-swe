/** Newsletter signup input: shared by the form, the action and tests. */
import { z } from "zod";

/** Where on the site a signup form is. Matches site_events.source. */
export const SIGNUP_SOURCES = ["footer", "job", "dashboard"] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

/** Campaign (UTM) tags of the page the form was on. */
export interface Utm {
  source?: string | undefined;
  medium?: string | undefined;
  campaign?: string | undefined;
}

// Bad or oversized tags are dropped rather than failing the signup.
const utmTag = z.string().trim().min(1).max(100).optional().catch(undefined);

export const signupSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  source: z.enum(SIGNUP_SOURCES),
  utm: z.object({ source: utmTag, medium: utmTag, campaign: utmTag }).catch({}),
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().max(200).default(""),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** The utm_source, utm_medium and utm_campaign tags of a query string. */
export function utmFromSearch(search: string): Utm {
  const params = new URLSearchParams(search);
  const tag = (name: string) => utmTag.parse(params.get(name) ?? undefined);
  return {
    source: tag("utm_source"),
    medium: tag("utm_medium"),
    campaign: tag("utm_campaign"),
  };
}
