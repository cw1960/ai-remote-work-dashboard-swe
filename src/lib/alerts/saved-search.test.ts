import { describe, expect, it } from "vitest";

import {
  describeSearch,
  parseFeedQuery,
  savedFiltersSchema,
  toFeedFilters,
  toSavedFilters,
} from "./saved-search";

const labels = {
  quoted: (q: string) => `“${q}”`,
  domain: (d: string) => d.toUpperCase(),
  language: (code: string) => `lang:${code}`,
  country: (code: string) => `country:${code}`,
  minPay: (amount: number) => `$${String(amount)}+/hr`,
  allJobs: "All jobs",
};

describe("saved searches", () => {
  it("canonicalises a feed query, dropping sort, page and posted", () => {
    const saved = toSavedFilters(
      parseFeedQuery(
        "q=lawyer&domain=law&language=fr&language=es&minPay=40&sort=pay&page=3&posted=7d",
      ),
    );
    expect(saved).toEqual({
      q: "lawyer",
      domains: ["law"],
      languages: ["es", "fr"],
      minPay: 40,
    });
    expect(savedFiltersSchema.parse(saved)).toEqual(saved);
  });

  it("saves the same search the same way whatever the order", () => {
    expect(toSavedFilters(parseFeedQuery("language=fr&language=es"))).toEqual(
      toSavedFilters(parseFeedQuery("language=es,fr")),
    );
  });

  it("saves an empty search as {}", () => {
    expect(toSavedFilters(parseFeedQuery(""))).toEqual({});
  });

  it("round-trips to feed filters", () => {
    const saved = { platforms: ["mercor"], country: "MX" };
    expect(toSavedFilters(toFeedFilters(saved))).toEqual(saved);
  });

  it("rejects unknown keys and bad values", () => {
    expect(savedFiltersSchema.safeParse({ sort: "pay" }).success).toBe(false);
    expect(savedFiltersSchema.safeParse({ minPay: -1 }).success).toBe(false);
  });

  it("describes a search in words", () => {
    expect(
      describeSearch(
        { q: "lawyer", platforms: ["mercor"], domains: ["law"], minPay: 40 },
        ["Mercor"],
        labels,
      ),
    ).toBe("“lawyer” · Mercor · LAW · $40+/hr");
    expect(describeSearch({}, [], labels)).toBe("All jobs");
  });
});
