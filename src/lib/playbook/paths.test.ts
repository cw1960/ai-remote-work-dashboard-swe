import { describe, expect, it } from "vitest";

import { playbookPath, seeOther } from "./paths";

describe("playbookPath", () => {
  it("serves the sales page at the sub-domain's root", () => {
    expect(playbookPath("playbook.airemoteworkdashboard.com")).toBe("/");
    expect(playbookPath("playbook.airemoteworkdashboard.com", "/thanks")).toBe(
      "/thanks",
    );
  });

  it("uses /playbook on any other host", () => {
    expect(playbookPath("main--airemoteworkdashboard.netlify.app")).toBe(
      "/playbook",
    );
    expect(playbookPath("localhost:3000", "/thanks")).toBe("/playbook/thanks");
    expect(playbookPath(null)).toBe("/playbook");
  });
});

describe("seeOther", () => {
  it("redirects relative to the host the browser used", () => {
    const response = seeOther("/?checkout=error#buy");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?checkout=error#buy");
  });
});
