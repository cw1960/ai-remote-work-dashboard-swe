import { describe, expect, it } from "vitest";

import {
  type Candidate,
  classifyListing,
  type Incoming,
  normalizeTitle,
  normalizeUrl,
  titleSimilarity,
} from "./dedupe";

const PLATFORM = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: "c1",
    platform_id: PLATFORM,
    title: "Physics Expert",
    url: "https://example.com/jobs/1",
    pay_min: 40,
    pay_max: 60,
    pay_unit: "hour",
    countries: ["US"],
    source: "manual",
    ...overrides,
  };
}

function incoming(overrides: Partial<Incoming>): Incoming {
  return {
    platformId: PLATFORM,
    title: "Physics Expert",
    url: "https://example.com/jobs/2",
    payMin: 40,
    payMax: 60,
    payUnit: "hour",
    countries: ["US"],
    ...overrides,
  };
}

describe("normalizeUrl", () => {
  it("ignores case, www, query, fragment and trailing slashes", () => {
    expect(
      normalizeUrl("https://WWW.Example.com/Jobs/1/?utm_source=x#top"),
    ).toBe("example.com/jobs/1");
  });
});

describe("normalizeTitle and titleSimilarity", () => {
  it("drops case, accents, punctuation and filler words", () => {
    expect(normalizeTitle("The Remote Química Expert – (Spanish)")).toBe(
      "quimica expert spanish",
    );
  });

  it("scores word overlap from 0 to 1", () => {
    expect(titleSimilarity("Physics Expert", "Physics Expert")).toBe(1);
    expect(titleSimilarity("Physics Expert", "Chemistry Tutor")).toBe(0);
    expect(
      titleSimilarity("Senior Physics Expert", "Physics Expert"),
    ).toBeCloseTo(2 / 3);
  });
});

describe("classifyListing", () => {
  it("calls the same address a duplicate, on any platform", () => {
    const match = candidate({
      platform_id: OTHER,
      title: "Something else",
      url: "https://www.example.com/jobs/2/",
    });
    expect(classifyListing(incoming({}), [match])).toEqual({
      kind: "duplicate",
      match,
    });
  });

  it("calls the same company and title with the same terms a duplicate", () => {
    const match = candidate({});
    expect(classifyListing(incoming({}), [match]).kind).toBe("duplicate");
  });

  it("updates a hand-picked listing whose pay or countries changed", () => {
    const match = candidate({});
    expect(classifyListing(incoming({ payMax: 80 }), [match])).toEqual({
      kind: "updated",
      match,
    });
    expect(
      classifyListing(incoming({ countries: ["MX", "US"] }), [match]).kind,
    ).toBe("updated");
  });

  it("never updates a fetched job: the platform's own data wins", () => {
    const match = candidate({ source: "feed" });
    expect(classifyListing(incoming({ payMax: 80 }), [match]).kind).toBe(
      "duplicate",
    );
  });

  it("holds a similar title at the same company for review", () => {
    const match = candidate({ title: "Physics Expert (PhD)" });
    expect(
      classifyListing(incoming({ title: "Physics PhD Expert Reviewer" }), [
        match,
      ]),
    ).toEqual({ kind: "uncertain", match });
  });

  it("picks the most similar title for review", () => {
    const weak = candidate({
      id: "weak",
      title: "Physics Expert Reviewer Pro",
    });
    const strong = candidate({ id: "strong", title: "Physics Expert Senior" });
    const outcome = classifyListing(
      incoming({ title: "Senior Physics Expert Lead" }),
      [weak, strong],
    );
    expect(outcome).toEqual({ kind: "uncertain", match: strong });
  });

  it("treats other titles, other companies and new companies as new", () => {
    const match = candidate({});
    expect(
      classifyListing(incoming({ title: "Chemistry Tutor" }), [match]).kind,
    ).toBe("new");
    expect(classifyListing(incoming({ platformId: OTHER }), [match]).kind).toBe(
      "new",
    );
    expect(classifyListing(incoming({ platformId: null }), [match]).kind).toBe(
      "new",
    );
  });
});
