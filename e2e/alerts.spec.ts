import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { magicLink, signIn, uniqueEmail } from "./helpers";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("job alerts", () => {
  test("saves a search, then manages it in settings", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    await page.goto("/?domain=law&sort=pay");

    await page.getByRole("button", { name: "Get alerts" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Get alerts for this search",
    });
    await expect(dialog.getByText("Law", { exact: true })).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog.getByLabel("Weekly").check();
    await dialog.getByRole("button", { name: "Save search" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Alerts on/ })).toBeVisible();

    // The same search (in any sort order) is recognised as saved.
    await page.goto("/jobs?domain=law");
    await page.getByRole("link", { name: /Alerts on/ }).click();
    await expect(page).toHaveURL(/\/settings$/);

    const list = page.getByRole("list", { name: "Your saved searches" });
    const item = list.getByRole("listitem").filter({ hasText: "Law" });
    await expect(item).toBeVisible();
    const frequency = item.getByLabel("How often to email Law");
    await expect(frequency).toHaveValue("weekly");
    await frequency.selectOption("daily");
    await expect(
      page.getByRole("status").filter({ hasText: "Saved." }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.reload();
    await expect(frequency).toHaveValue("daily");
    await expect(item.getByRole("link", { name: "See jobs" })).toHaveAttribute(
      "href",
      "/jobs?domain=law",
    );

    await item.getByRole("button", { name: "Delete saved search Law" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Deleted" }),
    ).toHaveText("Deleted “Law”.");
    await page.reload();
    await expect(page.getByText("No saved searches yet")).toBeVisible();
  });

  test("signed-out visitors sign in first, then confirm", async ({
    page,
    request,
  }, testInfo) => {
    await page.goto("/?q=lawyer");
    const getAlerts = page.getByRole("link", { name: "Get alerts" });
    await expect(getAlerts).toHaveAttribute(
      "href",
      `/sign-in?next=${encodeURIComponent("/?q=lawyer&save=1")}`,
    );
    await getAlerts.click();

    const email = uniqueEmail(testInfo.project.name);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Email me a link" }).click();
    await page.goto(await magicLink(request, email));
    // New account: onboarding first, then back to the feed.
    for (let step = 0; step < 5; step += 1) {
      await page.getByRole("button", { name: "Skip" }).click();
    }
    await page.getByRole("link", { name: "Continue" }).click();

    const dialog = page.getByRole("dialog", {
      name: "Get alerts for this search",
    });
    await expect(dialog.getByText("“lawyer”")).toBeVisible();
    await dialog.getByRole("button", { name: "Save search" }).click();
    await expect(page.getByRole("link", { name: /Alerts on/ })).toBeVisible();
  });

  test("the cron route refuses calls without the token", async ({
    request,
  }) => {
    const response = await request.post("/api/cron/alerts", {
      data: { at: "2026-10-05T14:00:00Z" },
      headers: { "x-cron-token": "0".repeat(64) },
    });
    expect(response.status()).toBe(401);
  });
});
