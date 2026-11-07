import { describe, expect, it } from "vitest";

import {
  addDays,
  dueView,
  fromDateInput,
  localToday,
  nextMonday,
  toDateInput,
} from "./dates";

describe("card dates", () => {
  it("round-trips a date input through its stored timestamp", () => {
    expect(fromDateInput("2026-10-04")).toBe("2026-10-04T00:00:00.000Z");
    expect(toDateInput("2026-10-04T00:00:00+00:00")).toBe("2026-10-04");
    expect(fromDateInput("")).toBeNull();
    expect(toDateInput(null)).toBe("");
  });

  it("reads today in the viewer's time zone", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("finds next Monday, a week ahead on a Monday", () => {
    expect(nextMonday("2026-10-01")).toBe("2026-10-05"); // Thursday
    expect(nextMonday("2026-10-05")).toBe("2026-10-12"); // Monday
    expect(nextMonday("2026-10-04")).toBe("2026-10-05"); // Sunday
  });

  it("labels follow-ups and flags past days as overdue", () => {
    const now = Date.parse("2026-10-05T15:00:00Z");
    expect(dueView(null, "en", now)).toEqual({
      dueLabel: null,
      overdue: false,
    });
    expect(dueView("2026-10-05T00:00:00Z", "en", now)).toEqual({
      dueLabel: "Oct 5",
      overdue: false,
    });
    expect(dueView("2026-10-04T00:00:00Z", "en", now).overdue).toBe(true);
  });
});
