import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  Micro1FormatError,
  micro1PageCount,
  micro1PageRequest,
  parseMicro1Page,
} from "./micro1.ts";

const page: unknown = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "micro1-page.json"),
    "utf8",
  ),
);

function byId(id: string) {
  const job = parseMicro1Page(page).jobs.find((j) => j.external_id === id);
  if (!job) throw new Error(`no job ${id}`);
  return job;
}

describe("parseMicro1Page", () => {
  it("returns the jobs, the skipped count and the total", () => {
    const result = parseMicro1Page(page);
    expect(result.jobs).toHaveLength(6);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(7);
  });

  it("maps a listing to the jobs shape", () => {
    expect(byId("f3ca9a77-ffd0-4eb7-b4ba-10deb5c71abb")).toMatchObject({
      title: "Bilingual Japanese Psychiatrist",
      summary: null,
      domain: "science",
      pay_min: 100,
      pay_max: 200,
      pay_unit: "hour",
      languages: ["ja"],
      countries: [],
      url: "https://jobs.micro1.ai/post/f3ca9a77-ffd0-4eb7-b4ba-10deb5c71abb",
      posted_at: "2026-09-28T19:40:05.000Z",
    });
  });

  it("prefers the hourly rate and ignores programming languages", () => {
    expect(byId("2635948c-eb96-440d-8e4d-b32b8af0a25d")).toMatchObject({
      title: "Backend Java Developer",
      domain: "software",
      pay_min: 60,
      pay_max: 110,
      pay_unit: "hour",
      languages: [],
    });
  });

  it("leaves pay empty when none is listed", () => {
    expect(byId("f3abc8e0-2f0e-4f28-aa3f-ee26ca98861f")).toMatchObject({
      domain: "robotics",
      pay_min: null,
      pay_max: null,
      pay_unit: null,
    });
  });

  it("finds every language in the title", () => {
    expect(byId("aae4e860-c280-40ae-9493-0ac9e6f44ad3").languages).toEqual([
      "en",
      "ja",
    ]);
  });

  it("uses monthly pay when there is no hourly rate", () => {
    const monthly = {
      status: true,
      total: 1,
      data: [
        {
          job_id: "m1",
          job_name: "Analyst",
          ideal_hourly_rate: null,
          ideal_monthly_salary_min: "2000.00",
          ideal_monthly_salary_max: "12000.00",
        },
      ],
    };
    expect(parseMicro1Page(monthly).jobs[0]).toMatchObject({
      pay_min: 2000,
      pay_max: 12000,
      pay_unit: "month",
      url: "https://jobs.micro1.ai/post/m1",
    });
  });

  it("rejects an unexpected response", () => {
    expect(() => parseMicro1Page({ status: false })).toThrow(Micro1FormatError);
  });
});

describe("micro1 paging", () => {
  it("asks for 100 listings a page, as the site does", () => {
    const { url, init } = micro1PageRequest(2);
    expect(url).toBe(
      "https://prod-api.micro1.ai/api/v1/job/portal?page=2&limit=100&keyword=",
    );
    expect(JSON.parse(init.body)).toEqual({
      action: "get_all_jobs",
      filters: { type: ["EXPERT"] },
    });
  });

  it("caps the pages per run", () => {
    expect(micro1PageCount(0)).toBe(0);
    expect(micro1PageCount(318)).toBe(4);
    expect(micro1PageCount(10_000)).toBe(5);
  });
});
