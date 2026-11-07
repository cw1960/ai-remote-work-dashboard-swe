/**
 * Greenhouse job boards (official, public Job Board API).
 *
 * One request per run: GET /v1/boards/<board>/jobs?content=true returns
 * every open posting with its description. A board can mix AI-training
 * roles with staff jobs, so each board has an `include` filter on titles.
 */
import { z } from "zod";

import { countriesFromLocation } from "./countries.ts";
import { classifyDomain } from "./domains.ts";
import { collect, type ParseResult } from "./job.ts";
import { detectLanguages } from "./languages.ts";
import {
  cleanText,
  htmlToText,
  parseHourlyPay,
  sectionAfter,
  summarize,
  toIsoUtc,
} from "./text.ts";

export interface GreenhouseBoard {
  /** The board token in boards.greenhouse.io/<board>. */
  board: string;
  /** Keeps AI-training roles; staff jobs on the same board are left out. */
  include: (title: string) => boolean;
  /** Headings after which the role description starts (skips boilerplate). */
  summaryAfter?: readonly string[];
}

/** Boards we read, keyed by `platforms.slug`. */
export const GREENHOUSE_BOARDS = {
  // Invisible's "agency" board lists only freelance AI trainer projects.
  invisible: { board: "agency", include: () => true },
  // xAI's board is mostly staff jobs; the AI tutor roles are the training work.
  xai: {
    board: "xai",
    include: (title: string) => /\bAI Tutor\b/i.test(title),
    summaryAfter: ["About the role", "About the team"],
  },
} as const satisfies Record<string, GreenhouseBoard>;

export function greenhouseBoardUrl(board: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
}

const postingSchema = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  content: z.string().nullish(),
  first_published: z.string().nullish(),
  updated_at: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
});
type Posting = z.infer<typeof postingSchema>;

const boardSchema = z.object({ jobs: z.array(z.unknown()) });

/** Thrown when the API answer no longer has the documented shape. */
export class GreenhouseFormatError extends Error {
  override name = "GreenhouseFormatError";
}

function toJob(posting: Posting, config: GreenhouseBoard) {
  const title = cleanText(posting.title) ?? "";
  const text = htmlToText(posting.content);
  const languages = detectLanguages(title);
  return {
    external_id: String(posting.id),
    title,
    summary: summarize(
      config.summaryAfter ? sectionAfter(text, config.summaryAfter) : text,
    ),
    domain: classifyDomain(title, languages),
    tags: [],
    ...parseHourlyPay(text),
    languages,
    countries: countriesFromLocation(posting.location?.name),
    countries_blocked: [],
    url: posting.absolute_url,
    posted_at: toIsoUtc(posting.first_published ?? posting.updated_at),
  };
}

/** Maps a board's API answer to jobs, keeping only the board's AI roles. */
export function parseGreenhouseBoard(
  json: unknown,
  config: GreenhouseBoard,
): ParseResult {
  const board = boardSchema.safeParse(json);
  if (!board.success) {
    throw new GreenhouseFormatError(
      `Greenhouse board ${config.board} has an unexpected shape`,
    );
  }
  const candidates: unknown[] = [];
  let skipped = 0;
  for (const raw of board.data.jobs) {
    const posting = postingSchema.safeParse(raw);
    if (!posting.success) {
      skipped += 1;
      continue;
    }
    if (!config.include(posting.data.title)) continue;
    candidates.push(toJob(posting.data, config));
  }
  const result = collect(candidates);
  return { jobs: result.jobs, skipped: result.skipped + skipped };
}
