/** Where an "Apply" click goes, for /go/<job>. Pure, so it is unit-tested. */
import { z } from "zod";

const httpsUrl = z.url({ protocol: /^https$/ });

/**
 * The platform's referral link for this job when it has one, else the job's
 * own link. A template that doesn't produce a valid https URL falls back to
 * the plain link, so a bad template never breaks "Apply".
 */
export function outboundUrl(job: {
  url: string;
  external_id: string;
  referral_url_template: string | null;
}): { url: string; referral: boolean } {
  if (job.referral_url_template) {
    const url = job.referral_url_template.replaceAll(
      "{external_id}",
      encodeURIComponent(job.external_id),
    );
    if (httpsUrl.safeParse(url).success) return { url, referral: true };
  }
  return { url: job.url, referral: false };
}

/**
 * Netlify deploy previews and branch deploys are served from
 * `<name>--<site>.netlify.app`. They share the production database, so
 * clicks made there are not logged.
 */
export function isPreviewHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0] ?? "";
  return hostname.endsWith(".netlify.app") && hostname.includes("--");
}
