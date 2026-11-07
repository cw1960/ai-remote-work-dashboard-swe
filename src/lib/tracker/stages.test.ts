import { describe, expect, it } from "vitest";

import { endPosition, STAGES } from "./stages";

describe("board stages", () => {
  it("has the six columns in order", () => {
    expect(STAGES).toEqual([
      "saved",
      "applied",
      "assessment",
      "interviewing",
      "offered",
      "rejected",
    ]);
  });

  it("puts a new card after the last one in its column", () => {
    expect(endPosition([])).toBe(1);
    expect(endPosition([3, 1.5, 7])).toBe(8);
  });
});
