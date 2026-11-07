/** Adds newsletter subscribers through Beehiiv's API. */
import { siteConfig } from "@/config/site";

import type { SignupInput, Utm } from "./signup";

const API = "https://api.beehiiv.com/v2";

export interface BeehiivConfig {
  apiKey: string;
  publicationId: string;
}

/**
 * Subscribes an email to the newsletter. Beehiiv's own double opt-in and
 * welcome automation apply, so its built-in welcome email stays off. The
 * page's campaign tags win; without them the signup is credited to this
 * site and the form's place on it. True when Beehiiv accepted it (an
 * existing subscriber counts).
 */
export async function createBeehiivSubscription(
  signup: Pick<SignupInput, "email" | "source"> & { utm: Utm },
  config: BeehiivConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(
      `${API}/publications/${encodeURIComponent(config.publicationId)}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: signup.email,
          reactivate_existing: false,
          send_welcome_email: false,
          utm_source: signup.utm.source ?? siteConfig.domain,
          utm_medium: signup.utm.medium ?? "website",
          utm_campaign: signup.utm.campaign ?? `signup-${signup.source}`,
          referring_site: siteConfig.url,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      console.error("beehiiv signup failed", response.status);
    }
    return response.ok;
  } catch (error) {
    console.error("beehiiv signup failed", error);
    return false;
  }
}
