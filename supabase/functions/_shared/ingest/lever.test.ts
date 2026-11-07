import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LEVER_SITES,
  LeverFormatError,
  leverPostingsUrl,
  parseLeverPostings,
} from "./lever.ts";

const postings: unknown = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "lever-weloglobal.json"),
    "utf8",
  ),
);

describe("Lever sites", () => {
  it("reads the official API", () => {
    expect(leverPostingsUrl("weloglobal")).toBe(
      "https://api.lever.co/v0/postings/weloglobal?mode=json",
    );
  });

  it("keeps Welo Data's remote AI roles only", () => {
    const { jobs, skipped } = parseLeverPostings(
      postings,
      LEVER_SITES["welo-data"],
    );
    expect(skipped).toBe(0);
    // Left out: an onsite AI role and a translation-agency role.
    expect(jobs.map((job) => job.title)).toEqual([
      "Ads Quality Rater - Bengali (India)",
      "Scout Junior Quality Coordinator - Portuguese (Brazil)",
    ]);
    expect(jobs[0]).toMatchObject({
      external_id: "96a11fc3-d786-4e85-933c-1155cb9217a7",
      domain: "language",
      languages: ["bn"],
      countries: ["IN"],
      pay_unit: "hour",
      url: "https://jobs.lever.co/weloglobal/96a11fc3-d786-4e85-933c-1155cb9217a7",
      posted_at: "2022-12-08T10:29:18.396Z",
    });
    // The leading "*" marker is dropped.
    expect(jobs[1]).toMatchObject({
      languages: ["pt"],
      countries: ["BR"],
      pay_min: null,
    });
  });

  it("rejects an answer that isn't a list", () => {
    expect(() =>
      parseLeverPostings({ ok: false }, LEVER_SITES["welo-data"]),
    ).toThrow(LeverFormatError);
  });
});
