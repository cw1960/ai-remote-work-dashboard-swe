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

test.describe("today panel", () => {
  test("lists overdue follow-ups, assessments and reapply dates", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    const today = page.getByRole("region", { name: "Today" });
    await expect(today.getByText("You're all caught up")).toBeVisible();

    // A card with a follow-up date in the past is overdue.
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByLabel("Card title").fill("Acme follow-up");
    await page.getByRole("button", { name: "Add to Saved" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Acme follow-up", exact: true })
      .filter({ visible: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "Acme follow-up" });
    await sheet.getByLabel("Follow up on", { exact: true }).fill("2020-01-02");
    await expect(sheet.getByRole("status")).toHaveText("Saved");
    await sheet.getByRole("button", { name: "Move to Applied" }).click();
    await expect(sheet.getByText("Saved → Applied")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A rejection whose waiting period is over.
    const micro1 = page
      .getByRole("region", { name: "Platform Passport" })
      .getByRole("listitem")
      .filter({ hasText: "micro1" });
    await micro1.getByLabel("micro1 status").selectOption("rejected");
    await expect(micro1.getByText("Saved")).toBeVisible();
    await micro1.getByLabel("Can reapply on").fill("2020-01-15");
    await expect(micro1.getByText("You can reapply now")).toBeVisible();
    await expect(micro1.getByText("Saved")).toBeVisible();

    await page.reload();
    const items = today.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Follow up on Acme follow-up");
    await expect(items.nth(0)).toContainText("Was due Jan 2");
    await expect(items.nth(1)).toContainText("You can reapply to micro1");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    // An item opens its card.
    await today.getByRole("link", { name: "Open Acme follow-up" }).click();
    await expect(page).toHaveURL(/\/dashboard\?card=[0-9a-f-]{36}$/);
    const opened = page.getByRole("dialog", { name: "Acme follow-up" });
    await expect(opened.getByLabel("Notes")).toBeVisible();

    // Assessments in progress show up too.
    await opened.getByRole("button", { name: "Move to Assessment" }).click();
    await expect(opened.getByText("Applied → Assessment")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      today.getByText("Finish your assessment: Acme follow-up"),
    ).toBeVisible();
  });
});
