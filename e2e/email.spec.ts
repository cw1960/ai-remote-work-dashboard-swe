import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { ownEmailPrefs, signIn, uniqueEmail } from "./helpers";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("email settings", () => {
  test("sends signed-out visitors to sign in first", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
  });

  test("turns an email type off and keeps it off", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(
      page,
      request,
      uniqueEmail(testInfo.project.name),
      "/settings",
    );
    await page.goto("/settings");
    const reminders = page.getByRole("switch", {
      name: /Follow-up reminders/,
    });
    await expect(reminders).toBeChecked();
    await expect(
      page.getByRole("switch", { name: /Job alerts/ }),
    ).toBeChecked();
    await expectNoAxeViolations(page);

    await reminders.click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
    await page.reload();
    await expect(reminders).not.toBeChecked();
    await expect(
      page.getByRole("switch", { name: /Job alerts/ }),
    ).toBeChecked();
  });
});

test.describe("unsubscribe links", () => {
  test("explains a link that doesn't work", async ({ page }) => {
    await page.goto("/unsubscribe?token=0123456789abcdef0123456789abcdef");
    await expect(
      page.getByRole("alert").filter({ hasText: "This link doesn't work" }),
    ).toBeVisible();
    await page.goto("/unsubscribe");
    await expect(
      page.getByRole("alert").filter({ hasText: "This link doesn't work" }),
    ).toBeVisible();
  });

  test("manages emails from the link without signing in", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    const { unsubscribe_token: token } = await ownEmailPrefs(page, request);

    // Sign out: the link alone must be enough.
    await page.context().clearCookies();
    const visitor = page;
    await visitor.goto(`/unsubscribe?token=${token}`);
    await visitor.getByRole("button", { name: "Turn off all emails" }).click();
    await expect(visitor.getByRole("status")).toHaveText("Saved");
    await visitor.reload();
    for (const name of [/Job alerts/, /Follow-up reminders/, /Weekly recap/]) {
      await expect(visitor.getByRole("switch", { name })).not.toBeChecked();
    }
    await expect(visitor.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expectNoAxeViolations(visitor);
  });

  test("supports one-click unsubscribe from mail apps", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    const { unsubscribe_token: token } = await ownEmailPrefs(page, request);

    const bad = await request.post("/api/unsubscribe?token=nope&list=all");
    expect(bad.status()).toBe(400);
    const unknown = await request.post(
      "/api/unsubscribe?token=0123456789abcdef0123456789abcdef&list=all",
    );
    expect(unknown.status()).toBe(404);

    const response = await request.post(
      `/api/unsubscribe?token=${token}&list=reminders`,
      { form: { "List-Unsubscribe": "One-Click" } },
    );
    expect(response.status()).toBe(200);
    expect((await ownEmailPrefs(page, request)).reminders_on).toBe(false);
  });
});

test.describe("email cron routes", () => {
  for (const route of ["reminders", "recap"]) {
    test(`${route} refuses calls without the cron token`, async ({
      request,
    }) => {
      const none = await request.post(`/api/cron/${route}`, {
        data: { day: "2026-10-05" },
      });
      expect(none.status()).toBe(401);
      const wrong = await request.post(`/api/cron/${route}`, {
        data: { day: "2026-10-05" },
        headers: { "x-cron-token": "0".repeat(64) },
      });
      expect(wrong.status()).toBe(401);
    });
  }
});
