import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MercorLayoutError, parseMercorExplorePage } from "./mercor.ts";

const html = readFileSync(
  join(import.meta.dirname, "fixtures", "mercor-explore.html"),
  "utf8",
);

function byTitle(title: string) {
  const job = parseMercorExplorePage(html).jobs.find((j) => j.title === title);
  if (!job) throw new Error(`no job titled ${title}`);
  return job;
}

describe("parseMercorExplorePage", () => {
  it("keeps active listings and counts the ones it cannot map", () => {
    const result = parseMercorExplorePage(html);
    expect(result.jobs).toHaveLength(6);
    expect(result.skipped).toBe(1);
    expect(result.jobs.map((j) => j.external_id)).not.toContain(
      "list_FIXTURE_PAUSED",
    );
  });

  it("maps a listing to the jobs shape", () => {
    expect(byTitle("Economics Research Expert")).toEqual({
      external_id: "list_AAABoOppU3x5v3XMbLRHP4rK",
      title: "Economics Research Expert",
      summary:
        "Mercor is recruiting Economics Research Experts for a research project with a leading foundational model AI lab.",
      domain: "science",
      tags: ["hourly", "remote"],
      pay_min: 120,
      pay_max: 150,
      pay_unit: "hour",
      languages: [],
      countries: [],
      countries_blocked: [],
      url: "https://work.mercor.com/jobs/list_AAABoOppU3x5v3XMbLRHP4rK",
      posted_at: "2026-09-28T23:46:06.000Z",
    });
  });

  it("returns each kept listing's full description apart from the job", () => {
    const result = parseMercorExplorePage(html);
    const descriptions = result.descriptions ?? {};
    expect(Object.keys(descriptions).sort()).toEqual(
      result.jobs.map((j) => j.external_id).sort(),
    );
    const text = descriptions.list_AAABoOppU3x5v3XMbLRHP4rK ?? "";
    expect(text).toMatch(
      /^Mercor is recruiting \*\*Economics Research Experts\*\*/,
    );
    expect(text).toContain("at least 10 hours per week");
    expect(descriptions).not.toHaveProperty("list_FIXTURE_PAUSED");
  });

  it("converts eligible and ineligible countries to ISO alpha-2", () => {
    expect(
      byTitle("Local Political Expert — Elections Forecasting & Political Risk")
        .countries,
    ).toEqual(["CA", "US"]);

    const healthcare = byTitle("Healthcare Business Development Contractor");
    expect(healthcare.countries).toEqual(["US"]);
    expect(healthcare.countries_blocked).toEqual(["IN", "NG"]);
  });

  it("maps pay frequencies to pay units", () => {
    expect(byTitle("Forensic / Toxicological Chemist").pay_unit).toBe("task");
    expect(
      byTitle("Customer Success - Operations (India Region)"),
    ).toMatchObject({ pay_min: 15000, pay_max: 30000, pay_unit: "year" });
  });

  it("detects languages named in the title", () => {
    expect(byTitle("Korean ChatGPT User")).toMatchObject({
      languages: ["ko"],
      countries: ["KR"],
      domain: "data",
    });
  });

  it("reports a layout change instead of returning zero jobs", () => {
    expect(() => parseMercorExplorePage("<html></html>")).toThrow(
      MercorLayoutError,
    );
    const noListings = html.replace('"listings"', '"items"');
    expect(() => parseMercorExplorePage(noListings)).toThrow(MercorLayoutError);
  });
});
