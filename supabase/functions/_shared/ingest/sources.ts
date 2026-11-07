/**
 * Per-platform fetch plans. `fetch` and `sleep` are injected so tests run
 * against recorded fixtures with no network.
 *
 * Etiquette (CLAUDE.md): read each listing once per run, send a clear
 * User-Agent with a contact address, time out, and stop at the first error
 * (the run is then logged as failed and closes nothing).
 */
import {
  GREENHOUSE_BOARDS,
  type GreenhouseBoard,
  greenhouseBoardUrl,
  parseGreenhouseBoard,
} from "./greenhouse.ts";
import { collect, type ParseResult } from "./job.ts";
import {
  LEVER_SITES,
  type LeverSite,
  leverPostingsUrl,
  parseLeverPostings,
} from "./lever.ts";
import { MERCOR_EXPLORE_URL, parseMercorExplorePage } from "./mercor.ts";
import {
  micro1PageCount,
  micro1PageRequest,
  parseMicro1Page,
} from "./micro1.ts";
import {
  parseRemoExpertsOpportunities,
  REMOEXPERTS_OPPORTUNITIES_URL,
} from "./remoexperts.ts";

export interface FetchContext {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  userAgent: string;
}

export interface SourceResult extends ParseResult {
  /** HTTP requests made to the source in this run. */
  requests: number;
}

/** Non-2xx answer from a source. */
export class SourceHttpError extends Error {
  override name = "SourceHttpError";
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

const TIMEOUT_MS = 30_000;
/** Pause between paged requests to the same source. */
export const PAGE_DELAY_MS = 3_000;

async function request(
  ctx: FetchContext,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await ctx.fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      "User-Agent": ctx.userAgent,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new SourceHttpError(response.status, url);
  return response;
}

async function fetchMercor(ctx: FetchContext): Promise<SourceResult> {
  const response = await request(ctx, MERCOR_EXPLORE_URL, {
    headers: { Accept: "text/html" },
  });
  return { ...parseMercorExplorePage(await response.text()), requests: 1 };
}

async function fetchMicro1(ctx: FetchContext): Promise<SourceResult> {
  const pages: ParseResult[] = [];
  let pageCount = 1;
  for (let page = 1; page <= pageCount; page += 1) {
    if (page > 1) await ctx.sleep(PAGE_DELAY_MS);
    const { url, init } = micro1PageRequest(page);
    const response = await request(ctx, url, init);
    const parsed = parseMicro1Page(await response.json());
    if (page === 1) pageCount = micro1PageCount(parsed.total);
    pages.push(parsed);
  }
  // Listings can shift between pages while we read; drop repeats.
  const merged = collect(pages.flatMap((page) => page.jobs));
  return {
    jobs: merged.jobs,
    skipped: pages.reduce((sum, page) => sum + page.skipped, 0),
    requests: pages.length,
  };
}

function greenhouse(config: GreenhouseBoard) {
  return async (ctx: FetchContext): Promise<SourceResult> => {
    const response = await request(ctx, greenhouseBoardUrl(config.board), {
      headers: { Accept: "application/json" },
    });
    return {
      ...parseGreenhouseBoard(await response.json(), config),
      requests: 1,
    };
  };
}

function lever(config: LeverSite) {
  return async (ctx: FetchContext): Promise<SourceResult> => {
    const response = await request(ctx, leverPostingsUrl(config.site), {
      headers: { Accept: "application/json" },
    });
    return {
      ...parseLeverPostings(await response.json(), config),
      requests: 1,
    };
  };
}

async function fetchRemoExperts(ctx: FetchContext): Promise<SourceResult> {
  const response = await request(ctx, REMOEXPERTS_OPPORTUNITIES_URL, {
    headers: { Accept: "application/json" },
  });
  return {
    ...parseRemoExpertsOpportunities(await response.json()),
    requests: 1,
  };
}

/** Platforms with an adapter, keyed by `platforms.slug`. */
export const SOURCES = {
  mercor: fetchMercor,
  micro1: fetchMicro1,
  invisible: greenhouse(GREENHOUSE_BOARDS.invisible),
  "welo-data": lever(LEVER_SITES["welo-data"]),
  xai: greenhouse(GREENHOUSE_BOARDS.xai),
  remoexperts: fetchRemoExperts,
} as const satisfies Record<
  string,
  (ctx: FetchContext) => Promise<SourceResult>
>;

export type SourceSlug = keyof typeof SOURCES;

export const SOURCE_SLUGS = Object.keys(SOURCES) as [
  SourceSlug,
  ...SourceSlug[],
];
