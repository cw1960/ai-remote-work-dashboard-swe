import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

/** Signs a new user in and skips onboarding, landing on the dashboard. */
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

async function addCard(page: Page, title: string) {
  await page.getByRole("button", { name: "Add card" }).click();
  await page.getByLabel("Card title").fill(title);
  await page.getByRole("button", { name: "Add to Saved" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("dashboard", () => {
  test("sends signed-out visitors to sign in first", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
  });

  test("starts empty, then adds and moves a card", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    await expect(page.getByText("Track your first job")).toBeVisible();

    await addCard(page, "Direct application to Acme");
    const card = page
      .getByRole("article")
      .filter({ hasText: "Direct application to Acme" })
      .filter({ visible: true });
    await expect(card).toBeVisible();

    await card
      .getByRole("button", { name: "Move Direct application to Acme" })
      .click();
    await page.getByRole("menuitem", { name: "Interviewing" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Moved “Direct application to Acme” to Interviewing.",
    );

    // The move is saved: after a reload the card is in Interviewing.
    await page.reload();
    const column =
      testInfo.project.name === "mobile"
        ? page.getByRole("tabpanel")
        : page.getByRole("region", { name: "Interviewing" });
    if (testInfo.project.name === "mobile") {
      await page.getByRole("tab", { name: /Interviewing/ }).click();
    }
    await expect(column.getByText("Direct application to Acme")).toBeVisible();
  });

  test("moves cards by drag and drop on desktop", async ({
    page,
    request,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, "Drag and drop is the desktop shortcut.");
    await newUserOnDashboard(page, request, testInfo.project.name);
    await addCard(page, "Drag me");

    await page
      .getByRole("article")
      .filter({ hasText: "Drag me" })
      .dragTo(page.getByRole("region", { name: "Assessment" }));
    await expect(
      page.getByRole("region", { name: "Assessment" }).getByText("Drag me"),
    ).toBeVisible();
    // The move shows at once; wait until the server has saved it.
    await expect(page.getByRole("status")).toHaveText(
      "Moved “Drag me” to Assessment.",
    );
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Assessment" }).getByText("Drag me"),
    ).toBeVisible();
  });

  test("shows platforms joined during onboarding", async ({
    page,
    request,
  }, testInfo) => {
    await signIn(page, request, uniqueEmail(testInfo.project.name));
    for (let step = 0; step < 4; step += 1) {
      await page.getByRole("button", { name: "Skip" }).click();
    }
    await page.getByLabel("micro1 status").selectOption("interviewing");
    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByRole("link", { name: "Go to my dashboard" }).click();

    if (testInfo.project.name === "mobile") {
      await page.getByRole("tab", { name: /Interviewing/ }).click();
    }
    await expect(
      page
        .getByRole("article")
        .filter({ hasText: "micro1" })
        .filter({ visible: true }),
    ).toContainText("Platform");
  });

  test("has no detectable WCAG 2.2 AA violations", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    await addCard(page, "Accessibility check");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("shows the Playbook card until it is hidden", async ({
    page,
    request,
  }, testInfo) => {
    await newUserOnDashboard(page, request, testInfo.project.name);
    const card = page.getByRole("complementary", {
      name: "The AI Remote Work Playbook",
    });
    await expect(
      card.getByRole("link", { name: /Get the Playbook/ }),
    ).toHaveAttribute("href", /\?ref=dashboard$/);
    await card.getByRole("button", { name: "Hide the Playbook card" }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Your dashboard" }),
    ).toBeVisible();
    await expect(card).toHaveCount(0);
  });
});
