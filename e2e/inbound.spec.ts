import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import {
  ownEmailPrefs,
  recordInboundEmail,
  signIn,
  uniqueEmail,
} from "./helpers";

async function newUserOnDashboard(
  page: Page,
  request: Parameters<typeof signIn>[1],
  email: string,
) {
  await signIn(page, request, email);
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.getByRole("link", { name: "Go to my dashboard" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Your dashboard" }),
  ).toBeVisible();
}

test.describe("email auto-capture", () => {
  test("Settings shows the private forwarding address", async ({
    page,
    request,
    context,
  }, testInfo) => {
    const email = uniqueEmail(testInfo.project.name);
    await newUserOnDashboard(page, request, email);
    const { inbound_token } = await ownEmailPrefs(page, request);

    await page.goto("/settings");
    const section = page.getByRole("region", { name: "Track by email" });
    await expect(
      section.getByText(
        `track+${inbound_token}@mail.airemoteworkdashboard.com`,
      ),
    ).toBeVisible();

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await section.getByRole("button", { name: "Copy address" }).click();
    await expect(section.getByRole("status")).toHaveText("Copied");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("a confident email moves the board; an unsure one waits for review", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail(testInfo.project.name);
    await newUserOnDashboard(page, request, email);
    const { inbound_token: token } = await ownEmailPrefs(page, request);

    // Confident: a micro1 confirmation forwarded by the user.
    expect(
      await recordInboundEmail(request, {
        token,
        from: email,
        subject: "Thank you for applying",
        platform: "micro1",
        stage: "applied",
      }),
    ).toBe("applied");
    // Unsure: two Mercor emails without a clear stage.
    for (const subject of ["Quick question", "Following up"]) {
      expect(
        await recordInboundEmail(request, {
          token,
          from: "team@mercor.com",
          subject,
          platform: "mercor",
          stage: null,
        }),
      ).toBe("needs_review");
    }

    await page.reload();
    const pipeline = page.getByRole("region", { name: "Pipeline" });
    if (testInfo.project.name === "mobile") {
      await page.getByRole("tab", { name: /Applied/ }).click();
    }
    await expect(
      pipeline
        .getByRole("article")
        .filter({ hasText: "micro1" })
        .filter({ visible: true }),
    ).toHaveCount(1);

    const review = page.getByRole("region", { name: "Forwarded emails" });
    await expect(review.getByRole("listitem")).toHaveCount(2);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    // File one under a new Mercor card in Interviewing.
    const first = review
      .getByRole("listitem")
      .filter({ hasText: "Quick question" });
    await expect(first.getByLabel("Card")).toHaveValue("new");
    await first.getByLabel("Stage").selectOption("interviewing");
    await first.getByRole("button", { name: "Add to board" }).click();
    await expect(review.getByRole("status")).toHaveText("Added to your board.");

    // Ignore the other.
    await review
      .getByRole("listitem")
      .filter({ hasText: "Following up" })
      .getByRole("button", { name: "Ignore" })
      .click();
    await expect(review).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole("region", { name: "Forwarded emails" }),
    ).toHaveCount(0);
    if (testInfo.project.name === "mobile") {
      await page.getByRole("tab", { name: /Interviewing/ }).click();
    }
    const mercor = pipeline
      .getByRole("article")
      .filter({ hasText: "Mercor" })
      .filter({ visible: true });
    await expect(mercor).toHaveCount(1);
    await mercor.getByRole("button", { name: "Mercor", exact: true }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Mercor" })
        .getByText("from a forwarded email"),
    ).toBeVisible();
  });
});
