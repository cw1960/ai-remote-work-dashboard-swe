import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { magicLink, uniqueEmail } from "./helpers";

test.describe("sign-in", () => {
  test("signs in with a magic link and returns to the page", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail(testInfo.project.name);
    await page.goto("/sign-in?next=/platforms/mercor");

    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Email me a link" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    await expect(page.getByRole("status")).toContainText(email);

    await page.goto(await magicLink(request, email));

    // A first sign-in goes through the short profile, then back.
    await expect(page).toHaveURL(/\/onboarding\?next=%2Fplatforms%2Fmercor$/);
    for (let step = 0; step < 5; step += 1) {
      await page.getByRole("button", { name: "Skip" }).click();
    }
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/platforms\/mercor$/);
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(signOut).toBeVisible();

    await signOut.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    // Still signed out after a reload, and private pages ask to sign in.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
  });

  test("only same-site forms can sign someone out", async ({ request }) => {
    const response = await request.post("/auth/sign-out", {
      headers: { "sec-fetch-site": "cross-site" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  });

  test("rejects an invalid email", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill("not-an-email");
    await page.getByRole("button", { name: "Email me a link" }).click();

    await expect(page.locator("#sign-in-error")).toContainText(
      "Enter a valid email address",
    );
  });

  test("explains a broken or used link", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=bogus&type=email&next=/");

    await expect(page).toHaveURL(/\/sign-in\?error=link/);
    await expect(page.locator("#sign-in-error")).toContainText(
      "That sign-in link didn't work",
    );
  });

  test("never redirects off-site after signing in", async ({ request }) => {
    const response = await request.get(
      "/auth/confirm?token_hash=bogus&type=email&next=//evil.example",
      { maxRedirects: 0 },
    );
    expect(response.headers().location).toBe("/sign-in?error=link&next=%2F");
  });

  test("shows Sign in in the header when signed out", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("has no detectable WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
