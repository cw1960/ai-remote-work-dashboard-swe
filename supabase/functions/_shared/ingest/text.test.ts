import { describe, expect, it } from "vitest";

import { countriesFromLocation, toAlpha2 } from "./countries.ts";
import { collect } from "./job.ts";
import { detectLanguages } from "./languages.ts";
import {
  decodeEntities,
  htmlToText,
  parseHourlyPay,
  sectionAfter,
  summarize,
  toIsoUtc,
} from "./text.ts";

describe("summarize", () => {
  it("returns the first paragraph as plain text", () => {
    expect(
      summarize("We need **Spanish** [experts](https://x.y).\n\nMore."),
    ).toBe("We need Spanish experts.");
  });

  it("cuts long text at a sentence or word boundary", () => {
    const long = `${"First sentence is here. ".repeat(20)}`;
    const summary = summarize(long, 100) ?? "";
    expect(summary.length).toBeLessThanOrEqual(100);
    expect(summary.endsWith(".")).toBe(true);

    const words = summarize("word ".repeat(100), 50) ?? "";
    expect(words.endsWith("…")).toBe(true);
    expect(words.length).toBeLessThanOrEqual(51);
  });

  it("skips headings and label lines", () => {
    expect(
      summarize(
        "# **Overview**\n\nLocation: Remote\n\nWe're looking for professionals with real-world experience.",
      ),
    ).toBe("We're looking for professionals with real-world experience.");
    expect(
      summarize(
        "**About the role**\n\nWe're hiring bilingual speakers to make AI safer.",
      ),
    ).toBe("We're hiring bilingual speakers to make AI safer.");
  });

  it("returns null for empty input", () => {
    expect(summarize("  \n\n ")).toBeNull();
    expect(summarize(null)).toBeNull();
  });
});

describe("toIsoUtc", () => {
  it("reads source timestamps as UTC", () => {
    expect(toIsoUtc("2026-09-28 19:40:05")).toBe("2026-09-28T19:40:05.000Z");
    expect(toIsoUtc("2026-09-28T19:40:05+02:00")).toBe(
      "2026-09-28T17:40:05.000Z",
    );
    expect(toIsoUtc("not a date")).toBeNull();
  });
});

describe("detectLanguages", () => {
  it("finds capitalised language names only", () => {
    expect(detectLanguages("Polish Translator", "polish your prose")).toEqual([
      "pl",
    ]);
    expect(detectLanguages("Mandarin and Cantonese Reviewer")).toEqual(["zh"]);
    expect(detectLanguages("Java Engineer")).toEqual([]);
  });
});

describe("toAlpha2", () => {
  it("maps known alpha-3 codes and drops unknown ones", () => {
    expect(toAlpha2(["USA", "mex", "XXX", "USA"])).toEqual(["MX", "US"]);
    expect(toAlpha2(null)).toEqual([]);
  });
});

describe("collect", () => {
  const job = {
    external_id: "x",
    title: "T",
    summary: null,
    domain: "other",
    tags: [],
    pay_min: 10,
    pay_max: 20,
    pay_unit: "hour",
    languages: [],
    countries: [],
    countries_blocked: [],
    url: "https://example.com",
    posted_at: null,
  };

  it("skips invalid listings and duplicate ids", () => {
    const result = collect([
      job,
      job,
      { ...job, external_id: "y", url: "http://insecure.example.com" },
      { ...job, external_id: "z", pay_min: 30 },
    ]);
    expect(result.jobs.map((j) => j.external_id)).toEqual(["x"]);
    expect(result.skipped).toBe(3);
  });
});

describe("htmlToText", () => {
  it("turns (double-escaped) HTML into paragraphs", () => {
    expect(
      htmlToText(
        "&lt;h2&gt;About&lt;/h2&gt;&lt;p&gt;We pay &amp;amp; care.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;",
      ),
    ).toBe("About\n\nWe pay & care.\n\nOne");
  });

  it("decodes named and numeric entities", () => {
    expect(decodeEntities("It&rsquo;s &#36;20 &#x2013; &bogus;")).toBe(
      "It’s $20 – &bogus;",
    );
  });
});

describe("sectionAfter", () => {
  it("returns the text after a matching heading", () => {
    expect(
      sectionAfter("Company intro\nABOUT THE ROLE:\nYou will teach.", [
        "About the role",
      ]),
    ).toBe("You will teach.");
  });

  it("returns everything when no heading matches", () => {
    expect(sectionAfter("Just text", ["About the role"])).toBe("Just text");
  });
});

describe("parseHourlyPay", () => {
  it.each([
    ["Pay: $22 per hour.", 22, 22],
    ["$35/hour - $45/hour depending on experience", 35, 45],
    ["from $6-to- $65 per hour", 6, 65],
    ["$2.40 USD per hour", 2.4, 2.4],
    ["between $20 and $30 hourly", 30, 30],
  ])("%s", (text, min, max) => {
    expect(parseHourlyPay(text)).toEqual({
      pay_min: min,
      pay_max: max,
      pay_unit: "hour",
    });
  });

  it.each([["$120,000 a year"], ["$50 per task"], ["No pay listed"], [null]])(
    "ignores %s",
    (text) => {
      expect(parseHourlyPay(text)).toEqual({
        pay_min: null,
        pay_max: null,
        pay_unit: null,
      });
    },
  );
});

describe("countriesFromLocation", () => {
  it.each([
    ["United States of America", ["US"]],
    ["Remote US", ["US"]],
    ["Mexico City, Mexico", ["MX"]],
    ["Spain; Portugal", ["ES", "PT"]],
    ["South Africa", ["ZA"]],
    ["World Wide - Remote", []],
    ["Remote International", []],
    ["Remote", []],
    ["Atlantis", []],
    [null, []],
  ])("%s → %j", (location, expected) => {
    expect(countriesFromLocation(location)).toEqual(expected);
  });
});
