import { describe, expect, it } from "vitest";

import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it.each([
    ["/jobs/123", "/jobs/123"],
    ["/?domain=law&sort=pay", "/?domain=law&sort=pay"],
    [null, "/"],
    ["", "/"],
    ["jobs", "/"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/\t/evil.com", "/"],
    ["/" + "a".repeat(600), "/"],
  ])("%j → %s", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });
});
