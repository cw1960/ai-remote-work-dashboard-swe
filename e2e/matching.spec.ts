import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

/** Signs in a new user who picks Law (or nothing) during onboarding. */
async function newUser(
  page: Page,
  request: Parameters<typeof signIn>[1],
  project: string,
  field: string | null,
) {
  await signIn(page, request, uniqueEmail(project));
  let skips = 5;
  if (field) {
    await page.getByRole("button", { name: field, exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    skips -= 1;
  }
  for (let step = 0; step < skips; step += 1) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.getByRole("link", { name: "Go to my dashboard" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Your dashboard" }),
  ).toBeVisible();
}

test.describe("matched jobs", () => {
  test("shows jobs in the user's field, with reasons, on the dashboard and feed", async ({
    page,
    request,
  }, testInfo) => {
    await newUser(page, request, testInfo.project.name, "Law");

    const matched = page.getByRole("list", { name: "Matched jobs" });
    await expect(matched.getByRole("listitem").first()).toBeVisible();
    await expect(matched.getByRole("listitem")).toHaveCount(3);
    for (const item of await matched.getByRole("listitem").all()) {
      await expect(item).toContainText("Fits you: Law");
    }

    // Tracking a match moves it to the pipeline and out of Matched jobs.
    await matched
      .getByRole("listitem")
      .first()
      .getByRole("button", { name: "Track this" })
      .click();
    await expect(matched.getByRole("listitem")).toHaveCount(2);
    await page.reload();
    await expect(matched.getByRole("listitem")).toHaveCount(2);
    await expect(
      page
        .getByRole("region", { name: "Pipeline" })
        .getByRole("article")
        .filter({ hasText: "Litigation Associate" })
        .filter({ visible: true }),
    ).toHaveCount(1);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    // The feed says the same on matching cards.
    await page.goto("/?domains=law");
    const cards = page.getByRole("list", { name: "Job results" });
    await expect(cards.getByText("Fits you:").first()).toBeVisible();
  });

  test("asks for a field or language when the profile has neither", async ({
    page,
    request,
  }, testInfo) => {
    await newUser(page, request, testInfo.project.name, null);
    await expect(page.getByText("Tell us what you do")).toBeVisible();
    await expect(page.getByText("Finish your profile")).toHaveCount(0);
    await page.getByRole("link", { name: "Add field and languages" }).click();
    await expect(page).toHaveURL(/\/onboarding\?next=%2Fdashboard$/);
  });

  test("signed-out visitors see no match reasons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("article").first()).toBeVisible();
    await expect(page.getByText("Fits you:")).toHaveCount(0);
  });
});
