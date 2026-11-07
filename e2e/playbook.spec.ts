import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The Playbook sales page. On the sub-domain it is served at "/"; on other
// hosts (CI, previews) at /playbook. CI has no Stripe key, so checkout
// explains that it is unavailable instead of opening Stripe.

const A11Y_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("playbook sales page", () => {
  test("sells the book with its price and guarantee", async ({ page }) => {
    await page.goto("/playbook");
    await expect(page).toHaveTitle(/The AI Remote Work Playbook/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Get paid to help build the future of AI.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Get the Playbook: $19" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "30-day money-back guarantee" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Cover of The AI Remote Work Playbook/ }),
    ).toBeVisible();

    const scan = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
    expect(scan.violations).toEqual([]);
  });

  test("reveals the free sample's expert judgment", async ({ page }) => {
    await page.goto("/playbook");
    const judgment = page.getByText(
      "A follows the request for exactly two reasons",
    );
    await expect(judgment).toBeHidden();
    await page.getByText("Show the expert judgment").click();
    await expect(judgment).toBeVisible();
  });

  test("explains when checkout isn't available", async ({ page }) => {
    await page.goto("/playbook");
    await page
      .getByRole("button", { name: "Get the Playbook: $19" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/playbook\?checkout=unavailable/);
    // Filtered: Next.js adds its own (empty) route-announcer alert.
    await expect(
      page.getByRole("alert").filter({ hasText: "Checkout isn't open yet" }),
    ).toBeVisible();
  });

  test("never gives the PDF without a paid purchase", async ({
    page,
    request,
  }) => {
    const download = await request.get(
      "/api/playbook/download?session_id=cs_test_notarealsession123",
      { maxRedirects: 0 },
    );
    expect(download.status()).toBe(303);
    expect(download.headers()["content-type"] ?? "").not.toContain("pdf");

    await page.goto("/playbook/thanks?session_id=cs_test_notarealsession123");
    await expect(
      page.getByRole("heading", { name: "We couldn't confirm this purchase" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Download/ })).toHaveCount(0);
  });

  test("rejects unsigned webhooks", async ({ request }) => {
    const response = await request.post("/api/playbook/webhook", {
      data: { type: "checkout.session.completed" },
    });
    expect([400, 503]).toContain(response.status());
  });

  test("is linked from the home page and the footer, tagged by placement", async ({
    page,
  }) => {
    await page.goto("/");
    const card = page.getByRole("complementary", {
      name: "The AI Remote Work Playbook",
    });
    await expect(
      card.getByRole("link", { name: /Get the Playbook/ }),
    ).toHaveAttribute(
      "href",
      "https://playbook.airemoteworkdashboard.com/?ref=home",
    );
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: "The AI Remote Work Playbook" }),
    ).toHaveAttribute("href", /\?ref=footer$/);
  });
});
