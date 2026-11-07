import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Runs against the local Supabase stack seeded with supabase/seed.sql.
// Seeded job ids are md5(external_id)::uuid.
const OPEN_JOB = "/jobs/4a37209f-fc53-5133-2ed2-a505cc4c279a"; // seed-mercor-01
const CLOSED_JOB = "/jobs/0912f11a-d0a4-50be-6384-50c7f9ca434d"; // seed-mercor-13

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("job page", () => {
  test("opens from the feed and shows the key facts", async ({ page }) => {
    await page.goto("/?q=litigation&sort=pay");
    await page
      .getByRole("link", { name: "Litigation Associate" })
      .first()
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Litigation Associate" }),
    ).toBeVisible();
    const facts = page.getByRole("definition");
    await expect(facts.first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Similar jobs" }),
    ).toBeVisible();
  });

  test("has JobPosting structured data while open", async ({ page }) => {
    await page.goto(OPEN_JOB);

    const json = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(JSON.parse(json ?? "{}")).toMatchObject({
      "@type": "JobPosting",
      title: "Litigation Associate",
      hiringOrganization: { name: "Mercor" },
      baseSalary: { value: { minValue: 40, maxValue: 50, unitText: "HOUR" } },
    });
  });

  test("marks a closed job and keeps it out of search", async ({ page }) => {
    await page.goto(CLOSED_JOB);

    await expect(page.getByRole("status")).toContainText(
      "This job is no longer listed on Mercor",
    );
    await expect(
      page.locator('script[type="application/ld+json"]'),
    ).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(
      page.getByRole("heading", { name: "Similar open jobs" }),
    ).toBeVisible();
  });

  test("answers 404 for an unknown or malformed id", async ({ page }) => {
    for (const path of [
      "/jobs/00000000-0000-4000-8000-000000000000",
      "/jobs/not-a-job",
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "We can't find this job.",
        }),
      ).toBeVisible();
    }
  });

  test("has no detectable WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto(OPEN_JOB);
    await expect(
      page.getByRole("heading", { name: "Similar jobs" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("platform page", () => {
  test("shows the platform's newest jobs and links to all of them", async ({
    page,
  }) => {
    await page.goto("/platforms/mercor");

    await expect(
      page.getByRole("heading", { level: 1, name: "Mercor" }),
    ).toBeVisible();
    await expect(page.getByText("13 open jobs", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Open jobs on Mercor" })
        .getByRole("listitem"),
    ).toHaveCount(5);

    await page.getByRole("link", { name: "See all 13 Mercor jobs" }).click();
    await expect(page).toHaveURL(/\?platform=mercor$/);
    await expect(page.locator("#results-heading")).toHaveText("13 open jobs");
  });

  test("lists vetted platforms without a referral program", async ({
    page,
  }) => {
    const response = await page.goto("/platforms/invisible");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: /Invisible/ }),
    ).toBeVisible();
  });

  test("hides platforms we don't list", async ({ page }) => {
    // Outlier's terms forbid scraping, so we never fetch or list it.
    const response = await page.goto("/platforms/outlier");
    expect(response?.status()).toBe(404);
  });

  test("answers 404 for an unknown platform", async ({ page }) => {
    const response = await page.goto("/platforms/no-such-platform");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "We can't find this platform.",
      }),
    ).toBeVisible();
  });

  test("has no detectable WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/platforms/mercor");
    await expect(
      page.getByRole("heading", { level: 1, name: "Mercor" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
