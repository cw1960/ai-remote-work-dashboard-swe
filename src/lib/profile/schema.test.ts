import { describe, expect, it } from "vitest";

import {
  onboardingStepSchema,
  parseSkills,
  stageForMembership,
} from "./schema";

describe("parseSkills", () => {
  it("splits on commas, trims and drops empties and repeats", () => {
    expect(parseSkills(" contract review,  Python ,, Python,")).toEqual([
      "contract review",
      "Python",
    ]);
  });

  it("caps the number and length of skills", () => {
    const many = Array.from({ length: 30 }, (_, i) => `skill ${i}`).join(",");
    expect(parseSkills(many)).toHaveLength(20);
    expect(parseSkills("x".repeat(100))[0]).toHaveLength(60);
  });
});

describe("stageForMembership", () => {
  it.each([
    ["not_joined", null],
    ["applied", "applied"],
    ["interviewing", "interviewing"],
    ["active", "offered"],
    ["rejected", "rejected"],
  ] as const)("%s → %s", (status, stage) => {
    expect(stageForMembership(status)).toBe(stage);
  });
});

describe("onboardingStepSchema", () => {
  it("accepts each step's answers", () => {
    expect(
      onboardingStepSchema.safeParse({
        step: "availability",
        hoursPerWeek: 20,
        targetRate: 45,
      }).success,
    ).toBe(true);
    expect(
      onboardingStepSchema.safeParse({
        step: "platforms",
        statuses: { mercor: "applied" },
      }).success,
    ).toBe(true);
  });

  it.each([
    { step: "expertise", domains: ["astrology"], skills: [] },
    { step: "languages", languages: ["english"] },
    { step: "location", country: "mx" },
    { step: "availability", hoursPerWeek: 0, targetRate: null },
    { step: "platforms", statuses: { mercor: "maybe" } },
    { step: "unknown" },
  ])("rejects %j", (input) => {
    expect(onboardingStepSchema.safeParse(input).success).toBe(false);
  });
});
