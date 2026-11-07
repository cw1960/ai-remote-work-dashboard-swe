import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

async function newUserOnDashboard(
  page: Page,
  request: Parameters<typeof signIn>[1],
  project: string,
) {
  await signIn(page, request, uniqueEmail(project));
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.getByRole("link", { name: "Go to my dashboard" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Your dashboard" }),
  ).toBeVisible();
}

async function moveTo(page: Page, title: string, stage: string) {
  await page
    .getByRole("article")
    .filter({ hasText: title })
    .filter({ visible: true })
    .getByRole("button", { name: `Move ${title}` })
    .click();
  await page.getByRole("menuitem", { name: stage }).click();
}

const stats = (page: Page) =>
  page.getByRole("region", { name: "Pipeline" }).getByLabel("Pipeline stats");

/** A stat tile's text, by its label. */
const tile = (page: Page, label: string) =>
  stats(page).locator("div").filter({ hasText: label });

test.describe("pipeline stats", () => {
  test("count applications and responses, and celebrate an offer", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    await expect(stats(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByLabel("Card title").fill("Acme");
    await page.getByRole("button", { name: "Add to Saved" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await moveTo(page, "Acme", "Applied");
    await expect(
      page.getByRole("status").filter({ hasText: "Moved" }),
    ).toHaveText("Moved “Acme” to Applied.");
    await expect(tile(page, "Applied this week")).toContainText("1");
    await expect(tile(page, "Response rate")).toContainText("0%");
    await expect(tile(page, "Response rate")).toContainText(
      "0 of 1 heard back",
    );

    await moveTo(page, "Acme", "Offered");
    await expect(
      page.getByRole("status").filter({ hasText: "Moved" }),
    ).toHaveText("Moved “Acme” to Offered. Congratulations!");
    await expect(page.locator(".confetti").first()).toBeAttached();
    await expect(tile(page, "Response rate")).toContainText("100%");
    await expect(tile(page, "Days per stage")).toContainText("Applied: 0 days");

    // Moves refresh the page data in the background; scan once it settles.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("no confetti for people who reduce motion", async ({
    page,
    request,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await newUserOnDashboard(page, request, testInfo.project.name);
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByLabel("Card title").fill("Calm offer");
    await page.getByRole("button", { name: "Add to Saved" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await moveTo(page, "Calm offer", "Offered");
    await expect(
      page.getByRole("status").filter({ hasText: "Moved" }),
    ).toHaveText("Moved “Calm offer” to Offered. Congratulations!");
    await expect(page.locator(".confetti").first()).toBeHidden();
  });
});
