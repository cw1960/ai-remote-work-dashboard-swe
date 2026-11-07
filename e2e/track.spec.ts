import { expect, type Page, test } from "@playwright/test";

import { magicLink, signIn, uniqueEmail } from "./helpers";

// Seeded job ids are md5(external_id)::uuid (supabase/seed.sql).
const MICRO1_JOB = "fa1e4a0c-cd30-7714-e00f-2b5d9e129da3"; // French Translator

async function skipOnboarding(page: Page) {
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
}

/** The visible board column (phones: pick its tab first). */
async function column(page: Page, stage: string, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("tab", { name: new RegExp(stage) }).click();
    return page.getByRole("tabpanel");
  }
  return page.getByRole("region", { name: stage });
}

test.describe("track this", () => {
  test("signed-out visitors are sent to sign in, then back", async ({
    page,
  }) => {
    await page.goto("/?q=translator");
    const track = page
      .getByRole("list", { name: "Job results" })
      .getByRole("link", { name: "Track this" });
    await expect(track).toHaveAttribute(
      "href",
      `/sign-in?next=${encodeURIComponent(`/jobs/${MICRO1_JOB}?track=1`)}`,
    );
  });

  test("tracks a job from the feed onto the board", async ({
    page,
    request,
    isMobile,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    await skipOnboarding(page);
    await page.goto("/?q=translator");

    const results = page.getByRole("list", { name: "Job results" });
    await results.getByRole("button", { name: "Track this" }).click();
    const tracked = results.getByRole("link", {
      name: "Tracked: open your dashboard",
    });
    await expect(tracked).toBeVisible();

    // Still tracked after a reload, and on the board in Saved.
    await page.reload();
    await tracked.click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const saved = await column(page, "Saved", isMobile);
    const card = saved
      .getByRole("article")
      .filter({ hasText: "French Translator" });
    await expect(card).toContainText("Job");
    await expect(card).toContainText("micro1 · $20–30 / hr");
  });

  test("finishes tracking after signing in", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail(testInfo.project.name);
    await page.goto(`/jobs/${MICRO1_JOB}`);
    const actions = page.getByTestId("job-actions").filter({ visible: true });
    await actions.getByRole("link", { name: "Track this" }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Email me a link" }).click();
    await page.goto(await magicLink(request, email));
    await skipOnboarding(page);
    await page.getByRole("link", { name: "Continue" }).click();

    await expect(page).toHaveURL(new RegExp(`/jobs/${MICRO1_JOB}\\?track=1$`));
    await expect(
      actions.getByRole("link", { name: "Tracked: open your dashboard" }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "Couldn't" }),
    ).toHaveCount(0);
  });

  test("tracks onboarding from a platform page", async ({
    page,
    request,
    isMobile,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    await skipOnboarding(page);
    await page.goto("/platforms/mercor");
    await page.getByRole("button", { name: "Track onboarding" }).click();
    await page
      .getByRole("link", { name: "Tracked: open your dashboard" })
      .click();

    const saved = await column(page, "Saved", isMobile);
    await expect(
      saved.getByRole("article").filter({ hasText: "Mercor" }),
    ).toContainText("Platform");
  });
});
