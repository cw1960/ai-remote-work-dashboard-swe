import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseRemoExpertsOpportunities,
  RemoExpertsFormatError,
} from "./remoexperts.ts";

const opportunities: unknown = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "remoexperts-opportunities.json"),
    "utf8",
  ),
);

function byId(id: string) {
  const job = parseRemoExpertsOpportunities(opportunities).jobs.find(
    (j) => j.external_id === id,
  );
  if (!job) throw new Error(`no job ${id}`);
  return job;
}

describe("parseRemoExpertsOpportunities", () => {
  it("returns every valid opportunity and counts the rest", () => {
    const result = parseRemoExpertsOpportunities(opportunities);
    expect(result.jobs).toHaveLength(9);
    expect(result.skipped).toBe(1);
  });

  it("maps an opportunity to the jobs shape", () => {
    expect(byId("6abf03c31ce5099676d01c6b")).toMatchObject({
      title: "Mobile Game Developer",
      domain: "software",
      tags: ["Computer Science"],
      pay_min: 50,
      pay_max: 120,
      pay_unit: "hour",
      countries: [],
      countries_blocked: [],
      url: "https://www.rex.zone/open-opportunities/6abf03c31ce5099676d01c6b",
      posted_at: "2026-10-02T01:07:15.259Z",
    });
    expect(byId("6abf03c31ce5099676d01c6b").summary).toMatch(
      /^We are looking for mobile game developers/,
    );
  });

  it("reads pay ranges, single rates and maximums", () => {
    expect(byId("69e9bd42fc57d1c20953b362")).toMatchObject({
      pay_min: 60,
      pay_max: 140,
    });
    expect(byId("6ab2e5f5d06bf4f7411f0873")).toMatchObject({
      pay_min: 20,
      pay_max: 20,
    });
    // "Up to USD $125 per hour"
    expect(byId("6abf00711ce5099676d019f8")).toMatchObject({
      pay_min: null,
      pay_max: 125,
      pay_unit: "hour",
    });
    // No stated unit, or no amount: unknown.
    expect(byId("690c3ec8a061410bec7943ae").pay_unit).toBeNull();
    expect(byId("69796bdb1f39a567aaad07fa").pay_unit).toBeNull();
  });

  it("maps country names, including official long forms", () => {
    expect(byId("6ab2e5f5d06bf4f7411f0873").countries).toEqual([
      "AU",
      "CA",
      "GB",
      "NZ",
      "US",
    ]);
    const generalist = byId("69796bdb1f39a567aaad07fa").countries;
    expect(generalist).toHaveLength(34);
    expect(generalist).toContain("VE");
  });

  it("falls back to the category when the title names no field", () => {
    expect(byId("6abf00711ce5099676d019f8").domain).toBe("engineering");
    expect(byId("6abef2341ce5099676d01260").domain).toBe("data");
  });

  it("never stores the publisher's name", () => {
    const result = parseRemoExpertsOpportunities(opportunities);
    expect(JSON.stringify(result)).not.toContain("Example Publisher");
  });

  it("rejects an answer that is not a list", () => {
    expect(() => parseRemoExpertsOpportunities({ items: [] })).toThrow(
      RemoExpertsFormatError,
    );
  });
});
