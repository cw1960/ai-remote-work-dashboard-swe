import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

// Seeded job ids are md5(external_id)::uuid (supabase/seed.sql).
const MICRO1_JOB = "fa1e4a0c-cd30-7714-e00f-2b5d9e129da3"; // French Translator

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

/** Opens a card's details from its (visible) board tile. */
async function openCard(page: Page, title: string) {
  await page
    .getByRole("button", { name: title, exact: true })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.getByLabel("Notes")).toBeVisible();
  return sheet;
}

test.describe("card details", () => {
  test("edits notes, dates and stage, and keeps them", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByLabel("Card title").fill("Acme direct");
    await page.getByRole("button", { name: "Add to Saved" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    let sheet = await openCard(page, "Acme direct");
    await expect(sheet.getByText("Added to Saved")).toBeVisible();
    // Manual cards have no platform, so no playbook.
    await expect(sheet.getByText(/What usually comes next/)).toHaveCount(0);

    await sheet.getByLabel("Notes").fill("Recruiter: Ana");
    await expect(sheet.getByRole("status")).toHaveText("Saved");

    await sheet.getByRole("button", { name: "In 3 days" }).click();
    await expect(
      sheet.getByLabel("Follow up on", { exact: true }),
    ).not.toHaveValue("");
    await expect(sheet.getByRole("status")).toHaveText("Saved");

    await sheet.getByRole("button", { name: "Move to Applied" }).click();
    await expect(sheet.getByText("Saved → Applied")).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Applied", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      sheet.getByLabel("Applied on", { exact: true }),
    ).not.toHaveValue("");

    // A move refreshes the page data in the background; scan once it settles.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveTitle(/\S/);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Everything was saved: reload and look again.
    await page.reload();
    if (testInfo.project.name === "mobile") {
      await page.getByRole("tab", { name: /Applied/ }).click();
    }
    const tile = page
      .getByRole("article")
      .filter({ hasText: "Acme direct" })
      .filter({ visible: true });
    await expect(tile.getByText(/^Follow up /)).toBeVisible();

    sheet = await openCard(page, "Acme direct");
    await expect(sheet.getByLabel("Notes")).toHaveValue("Recruiter: Ana");
    await expect(
      sheet.getByLabel("Follow up on", { exact: true }),
    ).not.toHaveValue("");
    await expect(sheet.getByText("Saved → Applied")).toBeVisible();
    await expect(sheet.getByText("Added to Saved")).toBeVisible();

    // Renaming a manual card updates its tile.
    await sheet.getByLabel("Card title").fill("Acme, direct application");
    await sheet.getByLabel("Card title").press("Enter");
    const renamed = page.getByRole("dialog", {
      name: "Acme, direct application",
    });
    await expect(renamed.getByRole("status")).toHaveText("Saved");
    await page.keyboard.press("Escape");
    await expect(tile).toHaveCount(0);
    await expect(
      page
        .getByRole("article")
        .filter({ hasText: "Acme, direct application" })
        .filter({ visible: true }),
    ).toBeVisible();
  });

  test("saves notes typed just before closing", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByLabel("Card title").fill("Quick note");
    await page.getByRole("button", { name: "Add to Saved" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    let sheet = await openCard(page, "Quick note");
    await sheet.getByLabel("Notes").fill("Typed then closed");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(async () => {
      await page.reload();
      sheet = await openCard(page, "Quick note");
      await expect(sheet.getByLabel("Notes")).toHaveValue("Typed then closed", {
        timeout: 1000,
      });
    }).toPass();
  });

  test("deletes a card after confirming", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    await page.getByRole("button", { name: "Add card" }).click();
    await page.getByLabel("Card title").fill("Delete me");
    await page.getByRole("button", { name: "Add to Saved" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const sheet = await openCard(page, "Delete me");
    await sheet.getByRole("button", { name: "Delete card" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Keep card" })
      .click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await sheet.getByRole("button", { name: "Delete card" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Deleted" }),
    ).toHaveText("Deleted “Delete me”.");

    await page.reload();
    await expect(page.getByText("Track your first job")).toBeVisible();
  });

  test("shows a job card's pay, listing and job page", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    await page.goto(`/jobs/${MICRO1_JOB}`);
    await page
      .getByTestId("job-actions")
      .filter({ visible: true })
      .getByRole("button", { name: "Track this" })
      .click();
    await expect(
      page
        .getByTestId("job-actions")
        .filter({ visible: true })
        .getByRole("link", { name: "Tracked: open your dashboard" }),
    ).toBeVisible();
    await page.goto("/dashboard");

    const sheet = await openCard(page, "French Translator");
    await expect(sheet.getByText("$20–30 / hr")).toBeVisible();

    // The platform's playbook follows the card's stage.
    const playbook = sheet.getByRole("region", {
      name: "What usually comes next on micro1",
    });
    await expect(playbook).toContainText("Apply on micro1's jobs portal");
    await sheet.getByRole("button", { name: "Move to Applied" }).click();
    await expect(playbook).toContainText("AI interview with Zara");
    await expect(
      playbook.getByRole("list", { name: "Checklist" }).getByRole("listitem"),
    ).toHaveCount(2);
    await expect(sheet.getByText("Still open")).toBeVisible();
    await expect(sheet.getByLabel("Card title")).toHaveCount(0);
    await sheet.getByRole("link", { name: "View job page" }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${MICRO1_JOB}$`));
  });
});
