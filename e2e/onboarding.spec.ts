import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

test.describe("onboarding", () => {
  test("sends signed-out visitors to sign in first", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fonboarding/);
  });

  test("saves every step and remembers the answers", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    await expect(page).toHaveURL(/\/onboarding\?next=%2F$/);
    const next = page.getByRole("button", { name: "Continue" });

    // 1. Expertise
    await page.getByRole("button", { name: "Law", exact: true }).click();
    await page.getByLabel("Other skills").fill("contract review, Spanish law");
    await next.click();

    // 2. Languages
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await page.getByPlaceholder("Search languages").fill("span");
    await page.getByRole("button", { name: "Spanish", exact: true }).click();
    await next.click();

    // 3. Location: Continue without a country asks for one.
    await expect(page.getByText("Step 3 of 5")).toBeVisible();
    await next.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Choose a country" }),
    ).toBeVisible();
    await page.getByLabel("Country").selectOption("MX");
    await page.getByRole("button", { name: "Try again" }).click();

    // 4. Availability
    await expect(page.getByText("Step 4 of 5")).toBeVisible();
    await page.getByRole("button", { name: "40", exact: true }).click();
    await page.getByLabel("Target hourly rate").fill("55");
    await next.click();

    // 5. Platforms
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await page.getByLabel("Mercor status").selectOption("applied");
    await page.getByRole("button", { name: "Finish" }).click();

    await expect(
      page.getByRole("heading", { name: "You're set" }),
    ).toBeVisible();
    await expect(page.getByText(/You skipped/)).toHaveCount(0);

    // Coming back shows the saved answers.
    await page.goto("/onboarding");
    await expect(
      page.getByRole("button", { name: "Law", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Other skills")).toHaveValue(
      "contract review, Spanish law",
    );
    for (let step = 0; step < 4; step += 1) {
      await page.getByRole("button", { name: "Skip" }).click();
    }
    await expect(page.getByLabel("Mercor status")).toHaveValue("applied");
  });

  test("has no detectable WCAG 2.2 AA violations", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    // Nothing (e.g. the signed-in header) may widen the page past the screen.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
