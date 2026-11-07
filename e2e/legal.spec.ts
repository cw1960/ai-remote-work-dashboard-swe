import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

const DOCS = [
  ["/legal/terms", "Terms of Use"],
  ["/legal/privacy", "Privacy Notice"],
  ["/legal/cookies", "Cookie Notice"],
  ["/legal/affiliates", "Affiliate Disclosure"],
] as const;

test.describe("legal pages", () => {
  for (const [path, title] of DOCS) {
    test(`${title} loads`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(page.getByText(/Last updated/)).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }

  test("name the operator and governing law", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByText(/El Barrial Devs of Santiago/)).toBeVisible();
    await expect(page.getByText(/courts of Nuevo León/)).toBeVisible();
  });

  test("cover the newsletter and its providers", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(
      page.getByText(/our daily newsletter, The Post-Human Countdown/),
    ).toBeVisible();
    await expect(
      page.getByText(/Beehiiv \(newsletter delivery and the newsletter/),
    ).toBeVisible();
    await expect(
      page.getByText(
        /AI provider, Anthropic\. It helps research[^.]*public information/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/we send Anthropic your master resume/),
    ).toBeVisible();
    await expect(
      page.getByText(/the operator and one administrator\) can see account/),
    ).toBeVisible();
  });

  test("answer 404 for an unknown document", async ({ page }) => {
    const response = await page.goto("/legal/nope");
    expect(response?.status()).toBe(404);
  });

  test("are linked from the footer of every page", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Site" });
    await footer.getByRole("link", { name: "Privacy" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Notice" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Site" }).getByRole("link", {
        name: "Contact",
      }),
    ).toHaveAttribute("href", "mailto:owner@example.com");
  });
});

test.describe("how it works", () => {
  test("explains the site and invites sign-up", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "How AI Remote Work Dashboard works",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "3. Track jobs you care about" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create a free account" }),
    ).toHaveAttribute("href", "/sign-in");
    await expectNoAxeViolations(page);
  });
});

test.describe("introduction", () => {
  test("shows signed-out visitors what the site does, until hidden", async ({
    page,
  }) => {
    await page.goto("/");
    const intro = page.getByRole("region", {
      name: /Land paid AI-training work/,
    });
    await expect(intro).toBeVisible();
    await expect(
      intro.getByRole("link", { name: "How it works" }),
    ).toHaveAttribute("href", "/how-it-works");
    await expectNoAxeViolations(page);

    await intro.getByRole("button", { name: "Hide this introduction" }).click();
    await expect(intro).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("region", { name: /Land paid AI-training work/ }),
    ).toHaveCount(0);
  });

  test("is not shown to signed-in users", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Remote AI training jobs" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: /Land paid AI-training work/ }),
    ).toHaveCount(0);
  });

  test("the sign-in page says what an account is for", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("A free account lets you:")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Terms of Use" }),
    ).toHaveAttribute("href", "/legal/terms");
    await expect(
      page.getByRole("link", { name: "Privacy Notice" }),
    ).toHaveAttribute("href", "/legal/privacy");
  });
});
