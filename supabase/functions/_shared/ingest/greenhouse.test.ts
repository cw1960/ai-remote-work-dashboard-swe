import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GREENHOUSE_BOARDS,
  GreenhouseFormatError,
  greenhouseBoardUrl,
  parseGreenhouseBoard,
} from "./greenhouse.ts";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"),
  );
}

describe("Greenhouse boards", () => {
  it("reads the official API with descriptions", () => {
    expect(greenhouseBoardUrl("agency")).toBe(
      "https://boards-api.greenhouse.io/v1/boards/agency/jobs?content=true",
    );
  });

  it("maps Invisible's AI trainer projects", () => {
    const { jobs, skipped } = parseGreenhouseBoard(
      fixture("greenhouse-agency.json"),
      GREENHOUSE_BOARDS.invisible,
    );
    expect(skipped).toBe(0);
    expect(jobs.map((job) => job.external_id)).toEqual([
      "4857878101",
      "4589003101",
      "4606987101",
      "4635213101",
      "4773890101",
    ]);

    expect(jobs[1]).toMatchObject({
      title: "Accounting Specialist - Freelance AI Trainer Project",
      domain: "finance",
      pay_min: 6,
      pay_max: 65,
      pay_unit: "hour",
      countries: ["US"],
      url: "https://job-boards.eu.greenhouse.io/agency/jobs/4589003101",
      posted_at: "2025-05-27T17:34:48.000Z",
    });
    expect(jobs[1]?.summary).toMatch(/^Are you an accounting expert/);
    // "World Wide - Remote" is open to everyone.
    expect(jobs[0]).toMatchObject({ countries: [], pay_min: 22, pay_max: 22 });
    // A subject expert fluent in a language keeps the subject as domain.
    expect(jobs[2]).toMatchObject({
      domain: "software",
      languages: ["fr"],
      countries: ["CH"],
    });
    expect(jobs[3]).toMatchObject({
      domain: "language",
      languages: ["af"],
      countries: ["ZA"],
    });
    // No hourly pay in the description: pay stays unknown.
    expect(jobs[4]).toMatchObject({
      pay_min: null,
      pay_max: null,
      pay_unit: null,
    });
  });

  it("keeps only xAI's AI tutor roles and skips the company intro", () => {
    const { jobs } = parseGreenhouseBoard(
      fixture("greenhouse-xai.json"),
      GREENHOUSE_BOARDS.xai,
    );
    expect(jobs.map((job) => job.title)).toEqual([
      "AI Tutor - Arabic",
      "AI Tutor - Chinese",
    ]);
    expect(jobs[0]).toMatchObject({
      domain: "language",
      languages: ["ar"],
      countries: [],
      pay_min: 35,
      pay_max: 45,
      pay_unit: "hour",
    });
    expect(jobs[0]?.summary).toMatch(/^As an AI Tutor/);
    // "Remote US"
    expect(jobs[1]?.countries).toEqual(["US"]);
  });

  it("rejects an answer without a jobs list", () => {
    expect(() =>
      parseGreenhouseBoard({ error: "x" }, GREENHOUSE_BOARDS.xai),
    ).toThrow(GreenhouseFormatError);
  });

  it("skips postings that don't validate", () => {
    const { jobs, skipped } = parseGreenhouseBoard(
      { jobs: [{ id: "not-a-number" }] },
      GREENHOUSE_BOARDS.invisible,
    );
    expect(jobs).toEqual([]);
    expect(skipped).toBe(1);
  });
});
