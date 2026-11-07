/**
 * Single source of truth for brand, domain and email placeholders.
 *
 * Decided 2026-10-01 (PLAN.md → "Decisions needed"). Change them here
 * only; nothing else in the codebase may hard-code these values.
 */
export const siteConfig = {
  /** Brand name shown in the UI, metadata and emails. */
  name: "AI Remote Work Dashboard",
  /** Apex domain the app is served from. */
  domain: "airemoteworkdashboard.com",
  /** Canonical public URL, used for metadata, sitemaps and email links. */
  url: "https://airemoteworkdashboard.com",
  /** Resend sending subdomain (SPF, DKIM, DMARC verified). */
  senderDomain: "mail.airemoteworkdashboard.com",
  /** From address for the app's emails (on the sending subdomain). */
  senderAddress: "hello@mail.airemoteworkdashboard.com",
  /**
   * Receiving domain for email auto-capture (track+<token>@…): the sending
   * subdomain, with receiving enabled in Resend. Other mail to it (replies)
   * is ignored by the inbound-email function.
   */
  inboundDomain: "mail.airemoteworkdashboard.com",
  /**
   * The daily newsletter, sent by Beehiiv from its own domain. Renamed from
   * "AI Remote Work Today" on 2026-11-05 (the Post-Human pivot, newsletter
   * repo PLAN.md → P7).
   */
  newsletter: {
    name: "The Post-Human Countdown",
    domain: "posthumancountdown.com",
    /** Issues and social posts are scheduled in this time zone. */
    timeZone: "America/Monterrey",
    /**
     * Who gets the social drafts by email (newsletter repo's
     * docs/distribution.md): LinkedIn drafts go to the editor, who posts them;
     * everything else to the owner. Both are admins (private.admins).
     */
    draftsTo: {
      linkedin: "editor@example.com",
      other: "owner@example.com",
    },
  },
  /** Who runs the service, as named in the legal pages. */
  operator: {
    name: "El Barrial Devs",
    city: "Santiago",
    region: "Nuevo León",
    country: "Mexico",
  },
  /** Date the Terms, Privacy and Cookie notices last changed (ISO). */
  legalUpdated: "2026-11-05",
  /** Contact address for users, and for the ingestion User-Agent. */
  supportEmail: "owner@example.com",
} as const;

export type SiteConfig = typeof siteConfig;
