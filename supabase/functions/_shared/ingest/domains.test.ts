import { describe, expect, it } from "vitest";

import { classifyDomain } from "./domains.ts";

describe("classifyDomain", () => {
  it.each([
    ["Accounting Specialist - Freelance AI Trainer Project", [], "finance"],
    ["Litigation Paralegal", [], "law"],
    ["Psychiatrist", [], "medicine"],
    ["Python Code Reviewer", [], "software"],
    ["Computer Vision Specialist", [], "ai-ml"],
    ["Mechanical Engineer", [], "engineering"],
    ["Chemistry Expert", [], "science"],
    ["Ads Quality Rater - Bengali (India)", ["bn"], "language"],
    ["AI Tutor - Arabic", ["ar"], "language"],
    ["AI Trainers Network - English", ["en"], "language"],
    ["Coding Specialist (Fluent in French)", ["fr"], "software"],
    ["AI Generalist (No Experience Required)", [], "generalist"],
    ["Something Unusual", [], "other"],
  ] as const)("%s → %s", (title, languages, expected) => {
    expect(classifyDomain(title, languages)).toBe(expected);
  });
});
