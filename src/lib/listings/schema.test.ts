import { describe, expect, it } from "vitest";

import { listingSchema } from "./schema";

const PLATFORM = "11111111-1111-4111-8111-111111111111";

function form(overrides: Record<string, string>) {
  return {
    platformId: PLATFORM,
    platformName: "",
    title: "  Physics Expert  ",
    url: "https://example.com/jobs/1",
    summary: "",
    payMin: "",
    payMax: "",
    payUnit: "",
    countries: "",
    postedAt: "",
    verifiedAt: "",
    ...overrides,
  };
}

function failingFields(input: Record<string, string>) {
  const result = listingSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path[0]);
}

describe("listingSchema", () => {
  it("cleans up a minimal listing", () => {
    expect(listingSchema.parse(form({}))).toEqual({
      platformId: PLATFORM,
      platformName: null,
      title: "Physics Expert",
      url: "https://example.com/jobs/1",
      summary: null,
      payMin: null,
      payMax: null,
      payUnit: null,
      countries: [],
      postedAt: null,
      verifiedAt: null,
    });
  });

  it("reads pay, countries and dates", () => {
    expect(
      listingSchema.parse(
        form({
          payMin: "40",
          payMax: "62,5",
          payUnit: "hour",
          countries: "United States, mexico; US\nCA",
          postedAt: "2026-10-01",
          verifiedAt: "2026-10-03",
        }),
      ),
    ).toMatchObject({
      payMin: 40,
      payMax: 62.5,
      payUnit: "hour",
      countries: ["CA", "MX", "US"],
      postedAt: "2026-10-01T00:00:00Z",
      verifiedAt: "2026-10-03T00:00:00Z",
    });
  });

  it("takes a new company name instead of a platform", () => {
    expect(
      listingSchema.parse(form({ platformId: "", platformName: " Atlas " })),
    ).toMatchObject({ platformId: null, platformName: "Atlas" });
  });

  it("reads country names, aliases and codes", () => {
    expect(
      listingSchema.parse(
        form({ countries: "United Kingdom, UK, Côte d’Ivoire, de" }),
      ).countries,
    ).toEqual(["CI", "DE", "GB"]);
    expect(
      listingSchema.parse(form({ countries: "Anywhere" })).countries,
    ).toEqual([]);
  });

  it("reports the country names it doesn't recognise", () => {
    const result = listingSchema.safeParse(
      form({ countries: "Mexico, Atlantis, Narnia" }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["countries"],
      params: { unknown: ["Atlantis", "Narnia"] },
    });
  });

  it("names the fields that are wrong", () => {
    expect(failingFields(form({ platformId: "" }))).toEqual(["platformName"]);
    expect(failingFields(form({ url: "http://example.com" }))).toEqual(["url"]);
    expect(failingFields(form({ title: " " }))).toEqual(["title"]);
    expect(failingFields(form({ countries: "Atlantis" }))).toEqual([
      "countries",
    ]);
    expect(failingFields(form({ payMin: "lots" }))).toEqual(["payMin"]);
    expect(
      failingFields(form({ payMin: "50", payMax: "40", payUnit: "hour" })),
    ).toEqual(["payMax"]);
    expect(failingFields(form({ payMin: "50" }))).toEqual(["payUnit"]);
    expect(failingFields(form({ postedAt: "01/10/2026" }))).toEqual([
      "postedAt",
    ]);
  });
});
