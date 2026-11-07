import { describe, expect, it } from "vitest";

import { signupSchema, utmFromSearch } from "./signup";

describe("signupSchema", () => {
  it("accepts a signup and trims the email", () => {
    const parsed = signupSchema.parse({
      email: "  reader@example.com ",
      source: "footer",
      utm: { source: "linkedin" },
    });
    expect(parsed).toEqual({
      email: "reader@example.com",
      source: "footer",
      utm: { source: "linkedin" },
      website: "",
    });
  });

  it("rejects an invalid email", () => {
    expect(
      signupSchema.safeParse({ email: "not-an-email", source: "job" }).success,
    ).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(
      signupSchema.safeParse({ email: "a@example.com", source: "popup" })
        .success,
    ).toBe(false);
  });

  it("drops bad campaign tags instead of failing", () => {
    const parsed = signupSchema.parse({
      email: "a@example.com",
      source: "dashboard",
      utm: { source: "x".repeat(101), medium: "", campaign: 42 },
    });
    expect(parsed.utm).toEqual({
      source: undefined,
      medium: undefined,
      campaign: undefined,
    });
  });

  it("keeps a filled-in honeypot so the action can spot bots", () => {
    const parsed = signupSchema.parse({
      email: "a@example.com",
      source: "footer",
      website: "https://spam.example",
    });
    expect(parsed.website).toBe("https://spam.example");
  });
});

describe("utmFromSearch", () => {
  it("reads the three campaign tags", () => {
    expect(
      utmFromSearch(
        "?utm_source=linkedin&utm_medium=social&utm_campaign=launch&x=1",
      ),
    ).toEqual({ source: "linkedin", medium: "social", campaign: "launch" });
  });

  it("leaves missing or empty tags unset", () => {
    expect(utmFromSearch("?utm_source=&q=law")).toEqual({
      source: undefined,
      medium: undefined,
      campaign: undefined,
    });
  });
});
