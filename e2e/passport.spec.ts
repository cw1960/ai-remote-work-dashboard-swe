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

/** The visible board tiles for Mercor, in a stage's column (or tab). */
async function boardTile(page: Page, project: string, stage: string) {
  if (project === "mobile") {
    // An empty board has no stage tabs on mobile.
    const tab = page.getByRole("tab", { name: new RegExp(stage) });
    if ((await tab.count()) > 0) await tab.click();
  }
  return page
    .getByRole("region", { name: "Pipeline" })
    .getByRole("article")
    .filter({ hasText: "Mercor" })
    .filter({ visible: true });
}

/** Waits until Mercor's card shows in a stage's column (or tab). */
async function expectCardIn(page: Page, project: string, stage: string) {
  await expect(async () => {
    await expect(await boardTile(page, project, stage)).toHaveCount(1, {
      timeout: 1000,
    });
  }).toPass();
}

test.describe("platform passport", () => {
  test("sets a status and reapply date, and moves the board card", async ({
    page,
    request,
  }, testInfo) => {
    const project = testInfo.project.name;
    await newUserOnDashboard(page, request, project);
    const passport = page.getByRole("region", { name: "Platform Passport" });
    const mercor = passport.getByRole("listitem").filter({ hasText: "Mercor" });

    // Not joined: a way in, and nothing on the board yet.
    await expect(mercor.getByLabel("Mercor status")).toHaveValue("not_joined");
    await expect(
      mercor.getByRole("link", { name: "Join Mercor" }),
    ).toHaveAttribute("href", "/platforms/mercor");
    await expect(await boardTile(page, project, "Applied")).toHaveCount(0);

    // Applied: the platform gets a card in Applied.
    await mercor.getByLabel("Mercor status").selectOption("applied");
    await expect(mercor.getByText("Saved")).toBeVisible();
    await expect(mercor.getByRole("link", { name: /open job/ })).toBeVisible();
    await expectCardIn(page, project, "Applied");

    // Rejected, with a reapply date: the card follows.
    await mercor.getByLabel("Mercor status").selectOption("rejected");
    await expect(mercor.getByText("Saved")).toBeVisible();
    await mercor.getByLabel("Can reapply on").fill("2020-01-15");
    await expect(mercor.getByText("Saved")).toBeVisible();
    await expect(mercor.getByText("You can reapply now")).toBeVisible();
    await expectCardIn(page, project, "Rejected");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    // Saved for good.
    await page.reload();
    await expect(mercor.getByLabel("Mercor status")).toHaveValue("rejected");
    await expect(mercor.getByLabel("Can reapply on")).toHaveValue("2020-01-15");
    await expectCardIn(page, project, "Rejected");
  });
});
