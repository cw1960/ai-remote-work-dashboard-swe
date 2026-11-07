import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("renders in English with the page title", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Track your AI training job applications/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no detectable WCAG 2.2 AA violations (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }

  test("offers a skip link as the first focusable element", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Keyboard navigation is checked on desktop.");
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});

test("unknown paths return a localized 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to the home page" }),
  ).toHaveAttribute("href", "/");
});

test("serves a sitemap of public pages, platforms and open jobs", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  expect(xml).toContain("/how-it-works</loc>");
  expect(xml).toContain("/legal/privacy</loc>");
  expect(xml).toContain("/platforms/mercor</loc>");
  expect(xml).toMatch(/\/jobs\/[0-9a-f-]{36}<\/loc>/);
  expect(xml).not.toContain("/dashboard");
});
