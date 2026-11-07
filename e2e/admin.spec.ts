import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

const ADMIN_PAGES = [
  "/admin",
  "/admin/users",
  "/admin/listings",
  "/admin/newsletter",
];

async function expectNoAxeViolations(page: Page) {
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
}

// supabase/seed.sql makes e2e-admin-<project>@example.com an admin. The
// admin's checks share one test so two tests never wait for the same
// sign-in email.
test.describe("admin area", () => {
  test("is hidden from signed-out visitors", async ({ page }) => {
    for (const path of ADMIN_PAGES) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });

  test("is hidden from signed-in users who are not admins", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail(testInfo.project.name);
    await signIn(page, request, email);
    for (const path of ADMIN_PAGES) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });

  test("an admin sees the overview, users and newsletter, and manages listings", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const project = testInfo.project.name;
    const adminEmail = `e2e-admin-${project}@example.com`;
    // A first sign-in goes to the profile form first; start from the dashboard.
    await signIn(page, request, adminEmail);
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Admin" }).click();

    // Overview
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin" }),
    ).toBeVisible();
    for (const name of [
      "Site",
      "Newsletter signups from the site",
      "Job sources",
    ]) {
      await expect(
        page.getByRole("heading", { level: 2, name, exact: true }),
      ).toBeVisible();
    }
    await expect(
      page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
    await expectNoAxeViolations(page);

    // Users: the admin's own account is listed and can be searched for.
    const sections = page.getByRole("navigation", { name: "Admin sections" });
    await sections.getByRole("link", { name: "Users" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Users" }),
    ).toBeVisible();
    await page.getByLabel("Search by email").fill(adminEmail);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/[?&]q=/);
    // The footer's newsletter form has a status line too: stay in main.
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "1 account",
    );
    await expect(
      page.getByRole("rowheader", { name: adminEmail }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // Newsletter: the seeded sample run (supabase/seed.sql), its pick and
    // drafts, each with a working Copy button.
    await page
      .getByRole("navigation", { name: "Admin sections" })
      .getByRole("link", { name: "Newsletter" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Newsletter" }),
    ).toBeVisible();
    for (const name of [
      "Model spend",
      "Runs",
      "Job picks",
      "Social posts and drafts",
    ]) {
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("listitem").filter({
        has: page.getByRole("link", { name: "Data Analyst", exact: true }),
      }),
    ).toContainText("Highest advertised hourly rate this week.");
    await expectNoAxeViolations(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const linkedin = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "LinkedIn" }) });
    await linkedin
      .getByRole("button", { name: "Copy the LinkedIn draft" })
      .click();
    await expect(linkedin.getByRole("status")).toHaveText("Copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "New AI training roles this week.\nData analysts are in demand.",
    );

    // Listings
    await page
      .getByRole("navigation", { name: "Admin sections" })
      .getByRole("link", { name: "Listings" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Hand-picked listings" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    const run = `${project}-${Date.now()}`;
    const title = `E2E Physics Expert ${run}`;
    const form = page.getByRole("form", { name: "Add a listing" });
    async function submit() {
      await form.getByLabel("Company", { exact: true }).selectOption("Outlier");
      await form.getByLabel("Job title").fill(title);
      await form
        .getByLabel("Listing address")
        .fill(`https://example.com/e2e/${run}`);
      await form.getByLabel("Pay from (USD)").fill("40");
      await form.getByLabel("Pay up to (USD)").fill("60");
      await form.getByLabel("Per", { exact: true }).selectOption("hour");
      await form
        .getByLabel("Countries (optional)")
        .fill("United States, mexico");
      await form.getByRole("button", { name: "Check and save" }).click();
    }

    // Invalid input names the field.
    await form.getByRole("button", { name: "Check and save" }).click();
    await expect(form.getByRole("alert")).toHaveText(
      "Check the fields marked in red.",
    );
    await expect(form.getByLabel("Job title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await submit();
    await expect(form.getByRole("status")).toHaveText(
      "Saved as a new listing.",
    );
    const item = page.getByRole("listitem").filter({ hasText: title });
    await expect(item).toContainText("Outlier");
    await expect(item).toContainText("Mexico, United States");
    await expect(item).toContainText("Open");

    await submit();
    await expect(form.getByRole("status")).toHaveText(
      `Not saved: it repeats “${title}”.`,
    );
    await expect(
      page.getByRole("listitem").filter({ hasText: title }),
    ).toHaveCount(1);

    await item.getByRole("button", { name: `Close: ${title}` }).click();
    await expect(item).toContainText("Closed");
  });
});
