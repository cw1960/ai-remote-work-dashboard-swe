/**
 * Email auto-capture rules: which user a forwarded email is for, which
 * platform sent it and what stage it means. Pure, so Deno (the
 * inbound-email function) and Vitest share it. Rules only, no AI.
 */

export const STAGES = [
  "saved",
  "applied",
  "assessment",
  "interviewing",
  "offered",
  "rejected",
] as const;
export type Stage = (typeof STAGES)[number];

/** The user's token from a `track+<token>@<inbound domain>` address. */
export function inboundToken(
  addresses: readonly string[],
  inboundDomain: string,
): string | null {
  const domain = inboundDomain.toLowerCase();
  for (const address of addresses) {
    const email = bareAddress(address);
    const match = /^track\+([a-z0-9]{32})@(.+)$/.exec(email);
    if (match?.[1] && match[2] === domain) return match[1];
  }
  return null;
}

/** "Mercor <Team@Mercor.com>" → "team@mercor.com". */
export function bareAddress(address: string): string {
  const angle = /<([^>]+)>/.exec(address);
  return (angle?.[1] ?? address).trim().toLowerCase();
}

/** The domain of an address, or null. */
export function domainOf(address: string): string | null {
  const at = bareAddress(address).lastIndexOf("@");
  return at > 0 ? bareAddress(address).slice(at + 1) : null;
}

/** Whether `domain` is `base` or one of its subdomains. */
function isDomainOf(domain: string, base: string): boolean {
  return domain === base || domain.endsWith(`.${base}`);
}

export interface PlatformDomains {
  slug: string;
  domains: readonly string[];
}

function platformForDomain(
  domain: string,
  platforms: readonly PlatformDomains[],
): string | null {
  const hit = platforms.find((p) =>
    p.domains.some((base) => isDomainOf(domain, base)),
  );
  return hit?.slug ?? null;
}

/**
 * The platform an email came from: its sender if that's a platform
 * (auto-forwarding keeps the original sender), else the original sender
 * quoted in a forwarded message ("From: Mercor <team@mercor.com>").
 */
export function platformFor(
  from: string,
  text: string,
  platforms: readonly PlatformDomains[],
): string | null {
  const direct = domainOf(from);
  const fromPlatform = direct ? platformForDomain(direct, platforms) : null;
  if (fromPlatform) return fromPlatform;

  const quoted = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const header = /^[\s>*]*(from|de|von)\s*:\s*(.+)$/i.exec(line);
    if (!header?.[2]) continue;
    for (const email of header[2].match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []) {
      const slug = platformForDomain(domainOf(email) ?? "", platforms);
      if (slug) quoted.add(slug);
    }
  }
  return quoted.size === 1 ? ([...quoted][0] ?? null) : null;
}

/** Phrases that say what stage an email is about, most decisive first. */
const STAGE_RULES: readonly { stage: Stage; pattern: RegExp }[] = [
  {
    stage: "rejected",
    pattern:
      /\b(unfortunately|not (be )?moving forward|not to move forward|decided to (move|go) (forward|ahead) with other|no longer (being )?considered|regret to inform|position has been filled|not selected)\b/i,
  },
  {
    stage: "offered",
    pattern:
      /\b(offer letter|job offer|work offer|instant offer|you('ve| have) been (selected|hired)|work trial|onboarding|sign your (contract|agreement|offer))\b/i,
  },
  {
    stage: "interviewing",
    pattern:
      /\b(schedule (an|your|a) (call|interview)|interview with (our|the) team|meet (with )?(the|our) team|next round|final round|video call)\b/i,
  },
  {
    stage: "assessment",
    pattern:
      /\b(assessment|ai interview|interview with zara|complete (your|the) (interview|test|task)|skills? (test|certification)|take (the|your) (test|interview)|coding (test|challenge))\b/i,
  },
  {
    stage: "applied",
    pattern:
      /\b(thank(s| you) for (applying|your application)|application (has been )?(received|submitted)|we('ve| have) received your application|you('ve| have) applied)\b/i,
  },
];

function stagesIn(text: string): Stage[] {
  return STAGE_RULES.filter((rule) => rule.pattern.test(text)).map(
    (rule) => rule.stage,
  );
}

/**
 * The stage an email is about, or null when unsure. The subject decides
 * when it names exactly one stage; otherwise the body must name exactly
 * one, except that a rejection always wins (they often thank you for
 * applying too).
 */
export function stageFor(subject: string, text: string): Stage | null {
  const inSubject = stagesIn(subject);
  if (inSubject.length === 1) return inSubject[0] ?? null;
  const inBody = stagesIn(`${subject}\n${text}`);
  if (inBody.includes("rejected")) return "rejected";
  return inBody.length === 1 ? (inBody[0] ?? null) : null;
}

/** Plain text from an HTML body, for when an email has no text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
