import { describe, expect, it } from "vitest";

import { hasReasons } from "./reasons";

const none = { domain: null, languages: [], payOk: false, country: null };

describe("hasReasons", () => {
  it("is false when nothing fits", () => {
    expect(hasReasons(none)).toBe(false);
  });

  it.each([
    { ...none, domain: "law" },
    { ...none, languages: ["es"] },
    { ...none, payOk: true },
    { ...none, country: "MX" },
  ])("is true for any one reason (%o)", (reasons) => {
    expect(hasReasons(reasons)).toBe(true);
  });
});
