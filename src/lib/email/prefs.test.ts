import { describe, expect, it } from "vitest";

import { unsubscribeArgs } from "./prefs";

describe("unsubscribeArgs", () => {
  it("turns off only the named list", () => {
    expect(unsubscribeArgs("reminders")).toEqual({ p_reminders_on: false });
    expect(unsubscribeArgs("alerts")).toEqual({ p_alerts_on: false });
  });

  it("turns off everything for all", () => {
    expect(unsubscribeArgs("all")).toEqual({
      p_alerts_on: false,
      p_reminders_on: false,
      p_recap_on: false,
    });
  });
});
