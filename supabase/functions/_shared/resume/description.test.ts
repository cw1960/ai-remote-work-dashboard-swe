import { describe, expect, it } from "vitest";

import {
  type DescriptionDeps,
  handleDescriptionRequest,
  RETRY_AFTER_MS,
  type SelectResult,
} from "./description.ts";

const JOB_ID = "00000000-0000-0000-0000-0000000000f1";
const NOW = Date.parse("2026-10-15T12:00:00Z");

const MICRO1_PAGE = `<script>self.__next_f.push([1,${JSON.stringify(
  `1:{"job":{"job_description":"<p>Review psychiatric case studies written for AI training, in Japanese and English.</p>"}}\n`,
)}])</script>`;

function job(slug: string, status = "open"): SelectResult {
  return {
    ok: true,
    data: [{ external_id: "ext-1", status, platforms: { slug } }],
  };
}

function setup(
  overrides: {
    stored?: SelectResult;
    job?: SelectResult;
    page?: () => Promise<string>;
  } = {},
) {
  const calls = {
    selects: [] as string[],
    pages: [] as string[],
    saved: [] as [string, string | null][],
    logs: [] as Record<string, unknown>[],
  };
  const deps: DescriptionDeps = {
    select: (path) => {
      calls.selects.push(path);
      return Promise.resolve(
        path.startsWith("job_descriptions")
          ? (overrides.stored ?? { ok: true, data: [] })
          : (overrides.job ?? job("micro1")),
      );
    },
    savePageDescription: (jobId, content) => {
      calls.saved.push([jobId, content]);
      return Promise.resolve();
    },
    fetchPage: (url) => {
      calls.pages.push(url);
      return overrides.page ? overrides.page() : Promise.resolve(MICRO1_PAGE);
    },
    log: (entry) => calls.logs.push(entry),
    now: () => NOW,
  };
  return { deps, calls };
}

describe("handleDescriptionRequest", () => {
  it("rejects a request without a job id", async () => {
    const { deps } = setup();
    expect(await handleDescriptionRequest({ jobId: "nope" }, deps)).toEqual({
      status: 400,
      body: { error: "invalid" },
    });
  });

  it("returns a stored description without reading the platform", async () => {
    const { deps, calls } = setup({
      stored: {
        ok: true,
        data: [
          {
            content: "Full Mercor description.",
            source: "feed",
            fetched_at: "2026-10-15T06:00:00Z",
          },
        ],
      },
    });
    expect(await handleDescriptionRequest({ jobId: JOB_ID }, deps)).toEqual({
      status: 200,
      body: { description: "Full Mercor description.", source: "feed" },
    });
    expect(calls.pages).toEqual([]);
    expect(calls.selects).toHaveLength(1);
  });

  it("reads a micro1 job's page once and records it", async () => {
    const { deps, calls } = setup();
    expect(await handleDescriptionRequest({ jobId: JOB_ID }, deps)).toEqual({
      status: 200,
      body: {
        description:
          "Review psychiatric case studies written for AI training, in Japanese and English.",
        source: "page",
      },
    });
    expect(calls.pages).toEqual(["https://jobs.micro1.ai/post/ext-1"]);
    expect(calls.saved).toEqual([
      [
        JOB_ID,
        "Review psychiatric case studies written for AI training, in Japanese and English.",
      ],
    ]);
    expect(JSON.stringify(calls.logs)).not.toContain("psychiatric");
  });

  it("records a page without a description so it is not read again today", async () => {
    const { deps, calls } = setup({
      page: () => Promise.resolve("<html></html>"),
    });
    expect(await handleDescriptionRequest({ jobId: JOB_ID }, deps)).toEqual({
      status: 200,
      body: { description: null },
    });
    expect(calls.saved).toEqual([[JOB_ID, null]]);
  });

  it("records a failed read and answers null", async () => {
    const { deps, calls } = setup({
      page: () => Promise.reject(new Error("HTTP 503")),
    });
    expect(await handleDescriptionRequest({ jobId: JOB_ID }, deps)).toEqual({
      status: 200,
      body: { description: null },
    });
    expect(calls.saved).toEqual([[JOB_ID, null]]);
    expect(calls.logs).toContainEqual(
      expect.objectContaining({ outcome: "page_error", error: "HTTP 503" }),
    );
  });

  it("waits a day before reading an empty page again", async () => {
    const recent = new Date(NOW - RETRY_AFTER_MS + 60_000).toISOString();
    const old = new Date(NOW - RETRY_AFTER_MS - 60_000).toISOString();
    const empty = (fetched_at: string): SelectResult => ({
      ok: true,
      data: [{ content: null, source: "page", fetched_at }],
    });

    const first = setup({ stored: empty(recent) });
    await handleDescriptionRequest({ jobId: JOB_ID }, first.deps);
    expect(first.calls.pages).toEqual([]);

    const second = setup({ stored: empty(old) });
    await handleDescriptionRequest({ jobId: JOB_ID }, second.deps);
    expect(second.calls.pages).toHaveLength(1);
  });

  it("does not read pages for other platforms or closed jobs", async () => {
    for (const result of [job("mercor"), job("micro1", "closed")]) {
      const { deps, calls } = setup({ job: result });
      expect(await handleDescriptionRequest({ jobId: JOB_ID }, deps)).toEqual({
        status: 200,
        body: { description: null },
      });
      expect(calls.pages).toEqual([]);
      expect(calls.saved).toEqual([]);
    }
  });

  it("answers 404 for an unknown job", async () => {
    const { deps } = setup({ job: { ok: true, data: [] } });
    expect(await handleDescriptionRequest({ jobId: JOB_ID }, deps)).toEqual({
      status: 404,
      body: { error: "job_not_found" },
    });
  });

  it("passes on an expired session", async () => {
    const { deps } = setup({
      stored: { ok: false, status: 401, message: "JWT expired" },
    });
    expect(await handleDescriptionRequest({ jobId: JOB_ID }, deps)).toEqual({
      status: 401,
      body: { error: "not_authenticated" },
    });
  });
});
