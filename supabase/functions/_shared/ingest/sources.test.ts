import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  type FetchContext,
  PAGE_DELAY_MS,
  SOURCES,
  SourceHttpError,
} from "./sources.ts";

const mercorHtml = readFileSync(
  join(import.meta.dirname, "fixtures", "mercor-explore.html"),
  "utf8",
);

const USER_AGENT = "TestBot/1.0 (+https://example.com; bot@example.com)";

function context(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const ctx: FetchContext = {
    fetch: vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push({ url, init });
      return Promise.resolve(respond(url, init));
    }),
    sleep: vi.fn(() => Promise.resolve()),
    userAgent: USER_AGENT,
  };
  return { ctx, calls };
}

function micro1Job(id: string) {
  return {
    job_id: id,
    job_name: `Job ${id}`,
    ideal_hourly_rate: { min: 20, max: 40 },
  };
}

describe("mercor source", () => {
  it("reads the Explore page once, with our User-Agent", async () => {
    const { ctx, calls } = context(() => new Response(mercorHtml));
    const result = await SOURCES.mercor(ctx);

    expect(result.requests).toBe(1);
    expect(result.jobs).toHaveLength(6);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://work.mercor.com/explore");
    expect(calls[0]?.init.headers).toMatchObject({ "User-Agent": USER_AGENT });
  });

  it("fails the run on an HTTP error", async () => {
    const { ctx } = context(() => new Response("busy", { status: 503 }));
    await expect(SOURCES.mercor(ctx)).rejects.toThrow(SourceHttpError);
  });
});

describe("micro1 source", () => {
  it("reads every page, pausing between them, and drops repeats", async () => {
    // 250 listed → 3 pages. Page 2 repeats the last job of page 1.
    const pages: Record<string, unknown[]> = {
      "1": [micro1Job("a"), micro1Job("b")],
      "2": [micro1Job("b"), micro1Job("c")],
      "3": [micro1Job("d")],
    };
    const { ctx, calls } = context((url) => {
      const page = new URL(url).searchParams.get("page") ?? "";
      return Response.json({
        status: true,
        total: 250,
        data: pages[page] ?? [],
      });
    });

    const result = await SOURCES.micro1(ctx);

    expect(result.requests).toBe(3);
    expect(result.jobs.map((j) => j.external_id)).toEqual(["a", "b", "c", "d"]);
    expect(calls.map((c) => c.init.method)).toEqual(["POST", "POST", "POST"]);
    expect(ctx.sleep).toHaveBeenCalledTimes(2);
    expect(ctx.sleep).toHaveBeenCalledWith(PAGE_DELAY_MS);
  });

  it("stops at the first failing page", async () => {
    const { ctx, calls } = context((url) =>
      new URL(url).searchParams.get("page") === "1"
        ? Response.json({ status: true, total: 300, data: [micro1Job("a")] })
        : new Response("slow down", { status: 429 }),
    );

    await expect(SOURCES.micro1(ctx)).rejects.toThrow("HTTP 429");
    expect(calls).toHaveLength(2);
  });
});

describe("Greenhouse and Lever sources", () => {
  it.each([
    [
      "invisible",
      "https://boards-api.greenhouse.io/v1/boards/agency/jobs?content=true",
    ],
    ["xai", "https://boards-api.greenhouse.io/v1/boards/xai/jobs?content=true"],
    ["welo-data", "https://api.lever.co/v0/postings/weloglobal?mode=json"],
  ] as const)("%s reads its feed once", async (slug, url) => {
    const body = slug === "welo-data" ? [] : { jobs: [] };
    const { ctx, calls } = context(() => Response.json(body));
    const result = await SOURCES[slug](ctx);

    expect(result).toEqual({ jobs: [], skipped: 0, requests: 1 });
    expect(calls.map((call) => call.url)).toEqual([url]);
    expect(calls[0]?.init.headers).toMatchObject({ "User-Agent": USER_AGENT });
  });

  it("fails the run on an HTTP error", async () => {
    const { ctx } = context(() => new Response("gone", { status: 404 }));
    await expect(SOURCES.xai(ctx)).rejects.toThrow(SourceHttpError);
  });
});

describe("remoexperts source", () => {
  it("reads the opportunities endpoint once", async () => {
    const { ctx, calls } = context(() => Response.json([]));
    const result = await SOURCES.remoexperts(ctx);

    expect(result).toEqual({ jobs: [], skipped: 0, requests: 1 });
    expect(calls.map((call) => call.url)).toEqual([
      "https://www.rex.zone/get-open-opportunities",
    ]);
    expect(calls[0]?.init.headers).toMatchObject({ "User-Agent": USER_AGENT });
  });

  it("fails the run on an HTTP error", async () => {
    const { ctx } = context(() => new Response("busy", { status: 503 }));
    await expect(SOURCES.remoexperts(ctx)).rejects.toThrow(SourceHttpError);
  });
});
