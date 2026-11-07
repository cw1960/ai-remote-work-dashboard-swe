import { describe, expect, it } from "vitest";

import { parsePlaybookRef, playbookUrl } from "./promo";

describe("playbookUrl", () => {
  it("tags the sales page with the placement", () => {
    expect(playbookUrl("micro1-job")).toBe(
      "https://playbook.airemoteworkdashboard.com/?ref=micro1-job",
    );
  });
});

describe("parsePlaybookRef", () => {
  it("keeps short lowercase tags only", () => {
    expect(parsePlaybookRef("tracker-assessment")).toBe("tracker-assessment");
    expect(parsePlaybookRef("newsletter2")).toBe("newsletter2");
    expect(parsePlaybookRef("<script>")).toBeNull();
    expect(parsePlaybookRef("A".repeat(5))).toBeNull();
    expect(parsePlaybookRef("x".repeat(41))).toBeNull();
    expect(parsePlaybookRef(["home"])).toBeNull();
    expect(parsePlaybookRef(undefined)).toBeNull();
  });
});
