import { playbookConfig } from "@/config/playbook";

/**
 * Where a link to the Playbook was placed. The tag travels from the link
 * (?ref=) through the sales page into the Stripe Checkout Session's
 * metadata, so Stripe shows which placements sell.
 */
export const PLAYBOOK_REFS = [
  "home",
  "footer",
  "dashboard",
  "tracker-assessment",
  "tracker-interviewing",
  "micro1-job",
  "master-profile",
] as const;
export type PlaybookRef = (typeof PLAYBOOK_REFS)[number];

/** The sales page, tagged with where the link was. */
export function playbookUrl(ref: PlaybookRef): string {
  return `${playbookConfig.url}/?ref=${ref}`;
}

/** A ref from a URL or form, or null when it isn't a valid tag. */
export function parsePlaybookRef(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9-]{1,40}$/.test(value)
    ? value
    : null;
}

/** The cookie that hides the dashboard's Playbook card (Cookie Notice). */
export const PLAYBOOK_CARD_COOKIE = "playbook_card_dismissed";
