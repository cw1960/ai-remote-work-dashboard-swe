/**
 * Duplicate check for hand-picked listings: plain rules, no AI.
 *
 * - duplicate: the same address, or the same company and title with
 *   nothing new (feed jobs are the platform's own data, so a match there is
 *   always a duplicate)
 * - updated: the same company and title as a hand-picked listing, with new
 *   pay or countries; that listing is updated
 * - uncertain: a similar title at the same company; saved for the editor
 *   to decide
 * - new: anything else
 */
import type { PayUnit } from "./schema";

export interface Candidate {
  id: string;
  platform_id: string;
  title: string;
  url: string;
  pay_min: number | null;
  pay_max: number | null;
  pay_unit: PayUnit | null;
  countries: string[];
  source: string;
}

export interface Incoming {
  platformId: string | null;
  title: string;
  url: string;
  payMin: number | null;
  payMax: number | null;
  payUnit: PayUnit | null;
  countries: string[];
}

export type Outcome =
  | { kind: "new" }
  | { kind: "duplicate"; match: Candidate }
  | { kind: "updated"; match: Candidate }
  | { kind: "uncertain"; match: Candidate };

/** Titles at least this similar (word overlap) need the editor's call. */
export const SIMILARITY_THRESHOLD = 0.6;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "the",
  "to",
  "with",
  "remote",
]);

/** Lower case, no query string, fragment, "www." or trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function words(title: string): string[] {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((word) => word !== "" && !STOP_WORDS.has(word));
}

export function normalizeTitle(title: string): string {
  return words(title).join(" ");
}

/** Shared words over all words (Jaccard), 0 to 1. */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(words(a));
  const right = new Set(words(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function sameTerms(incoming: Incoming, match: Candidate): boolean {
  return (
    incoming.payMin === match.pay_min &&
    incoming.payMax === match.pay_max &&
    incoming.payUnit === match.pay_unit &&
    incoming.countries.join(",") === [...match.countries].sort().join(",")
  );
}

export function classifyListing(
  incoming: Incoming,
  candidates: readonly Candidate[],
): Outcome {
  const url = normalizeUrl(incoming.url);
  const sameUrl = candidates.find((c) => normalizeUrl(c.url) === url);
  if (sameUrl) return { kind: "duplicate", match: sameUrl };

  if (incoming.platformId === null) return { kind: "new" };
  const samePlatform = candidates.filter(
    (c) => c.platform_id === incoming.platformId,
  );

  const title = normalizeTitle(incoming.title);
  const sameTitle = samePlatform.find((c) => normalizeTitle(c.title) === title);
  if (sameTitle) {
    return sameTitle.source === "manual" && !sameTerms(incoming, sameTitle)
      ? { kind: "updated", match: sameTitle }
      : { kind: "duplicate", match: sameTitle };
  }

  let best: { match: Candidate; score: number } | null = null;
  for (const candidate of samePlatform) {
    const score = titleSimilarity(incoming.title, candidate.title);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { match: candidate, score };
    }
  }
  return best ? { kind: "uncertain", match: best.match } : { kind: "new" };
}
