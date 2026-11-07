import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

test.describe("all jobs (signed in)", () => {
  test("sends signed-out visitors to sign in first", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs$/);
  });

  test("is one click from the dashboard and keeps its filters inside", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    for (let step = 0; step < 5; step += 1) {
      await page.getByRole("button", { name: "Skip" }).click();
    }
    await page.getByRole("link", { name: "Go to my dashboard" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Your dashboard" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "All jobs" }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "All opportunities" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Job results" })
        .getByRole("listitem")
        .first(),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    // Searching stays on /jobs, and so does "Clear all".
    await page.getByRole("searchbox").fill("Litigation");
    await page.getByRole("searchbox").press("Enter");
    await expect(page).toHaveURL(/\/jobs\?q=Litigation$/);
    await expect(page.getByText("Search: “Litigation”")).toBeVisible();
    await page
      .getByRole("link", { name: /Clear search/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/jobs$/);
  });
});
