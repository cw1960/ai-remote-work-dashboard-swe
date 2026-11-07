import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  parseFeedFilters,
  postedSince,
  toSearchParams,
  withoutFilters,
} from "./filters";
import { formatPayAmount, formatPostedAgo } from "./format";

describe("parseFeedFilters", () => {
  it("returns defaults for an empty query", () => {
    expect(parseFeedFilters({})).toEqual({
      q: "",
      platforms: [],
      domains: [],
      languages: [],
      country: null,
      minPay: null,
      posted: null,
      sort: "newest",
      page: 1,
    });
  });

  it("reads repeated and comma-separated values", () => {
    const filters = parseFeedFilters({
      q: "  spanish lawyer ",
      platform: ["mercor", "micro1,mercor"],
      domain: "law,science",
      language: ["es"],
      country: "mx",
      minPay: "40",
      posted: "7d",
      sort: "pay",
      page: "3",
    });
    expect(filters).toEqual({
      q: "spanish lawyer",
      platforms: ["mercor", "micro1"],
      domains: ["law", "science"],
      languages: ["es"],
      country: "MX",
      minPay: 40,
      posted: "7d",
      sort: "pay",
      page: 3,
    });
  });

  it("drops invalid values instead of failing", () => {
    const filters = parseFeedFilters({
      platform: ["Mercor!", "../etc"],
      domain: "astrology",
      language: "spanish",
      country: "Mexico",
      minPay: "-5",
      posted: "1y",
      sort: "random",
      page: "0",
    });
    expect(filters).toMatchObject({
      platforms: [],
      domains: [],
      languages: [],
      country: null,
      minPay: null,
      posted: null,
      sort: "newest",
      page: 1,
    });
  });

  it("caps the search length", () => {
    expect(parseFeedFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("toSearchParams", () => {
  it("round-trips and leaves defaults out", () => {
    const filters = parseFeedFilters({
      platform: ["mercor"],
      minPay: "50",
      sort: "newest",
      page: "1",
    });
    const params = toSearchParams(filters);
    expect(params.toString()).toBe("platform=mercor&minPay=50");
    expect(parseFeedFilters(Object.fromEntries(params))).toEqual(filters);
  });

  it("applies overrides, e.g. the next page", () => {
    const filters = parseFeedFilters({ q: "law" });
    expect(toSearchParams(filters, { page: 2 }).toString()).toBe(
      "q=law&page=2",
    );
  });

  it("keeps the search and sort when filters are removed", () => {
    const filters = parseFeedFilters({
      q: "finance",
      domain: "law",
      platform: "mercor",
      minPay: "40",
      sort: "pay",
      page: "2",
    });
    expect(toSearchParams(withoutFilters(filters)).toString()).toBe(
      "q=finance&sort=pay",
    );
  });
});

describe("helpers", () => {
  it("counts active filters, not search or sort", () => {
    expect(
      activeFilterCount(
        parseFeedFilters({
          q: "x",
          sort: "pay",
          domain: "law,data",
          posted: "1d",
        }),
      ),
    ).toBe(3);
  });

  it("computes the posted-since date", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(postedSince("7d", now).toISOString()).toBe(
      "2026-09-23T12:00:00.000Z",
    );
  });

  it("formats pay ranges", () => {
    expect(formatPayAmount(40, 120, "en")).toBe("$40–120");
    expect(formatPayAmount(60, 60, "en")).toBe("$60");
    expect(formatPayAmount(null, 45, "en")).toBe("$45");
    expect(formatPayAmount(15000, 30000, "en")).toBe("$15,000–30,000");
    expect(formatPayAmount(null, null, "en")).toBeNull();
  });

  it("formats posting age", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(formatPostedAgo("2026-09-27T12:00:00Z", "en", now)).toBe(
      "3 days ago",
    );
    expect(formatPostedAgo("2026-09-29T12:00:00Z", "en", now)).toBe(
      "yesterday",
    );
  });
});
