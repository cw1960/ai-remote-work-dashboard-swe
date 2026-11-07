import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

// Runs against the local Supabase stack, without a Beehiiv key: the action
// skips Beehiiv and still counts the signup in site_events.
const OPEN_JOB = "/jobs/4a37209f-fc53-5133-2ed2-a505cc4c279a"; // seed-mercor-01

/** site_events rows with this utm_campaign, read with the service role. */
async function countedSignups(
  request: APIRequestContext,
  campaign: string,
): Promise<{ source: string; utm_source: string | null }[]> {
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const response = await request.get(
    `${url}/rest/v1/site_events?select=source,utm_source&utm_campaign=eq.${campaign}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    source: string;
    utm_source: string | null;
  }[];
}

test.describe("newsletter signup", () => {
  test("subscribes from the footer and counts it with the page's campaign", async ({
    page,
    request,
  }, testInfo) => {
    const campaign = `e2e-${testInfo.project.name}-${Date.now()}`;
    await page.goto(`/?utm_source=linkedin&utm_campaign=${campaign}`);

    // Next.js has its own alert (the route announcer): stay inside the region.
    const region = page.getByRole("region", {
      name: "Get The Post-Human Countdown",
    });
    const signup = region.getByRole("form");
    await signup
      .getByLabel("Your email for the newsletter")
      .fill("not-an-email");
    await signup.getByRole("button", { name: "Subscribe free" }).click();
    await expect(region.getByRole("alert")).toHaveText(
      "Enter a valid email address.",
    );

    await signup
      .getByLabel("Your email for the newsletter")
      .fill(uniqueEmail(testInfo.project.name));
    await signup.getByRole("button", { name: "Subscribe free" }).click();
    await expect(region.getByRole("status")).toHaveText(
      "Check your inbox and click the link to confirm your subscription.",
    );

    await expect
      .poll(() => countedSignups(request, campaign))
      .toEqual([{ source: "footer", utm_source: "linkedin" }]);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("offers the newsletter on job pages", async ({ page }) => {
    await page.goto(OPEN_JOB);
    await expect(
      page.getByRole("form", { name: "Want the best of these in your inbox?" }),
    ).toBeVisible();
  });

  test("fills in a signed-in user's email on the dashboard", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail(testInfo.project.name);
    await signIn(page, request, email, "/dashboard");
    await page.goto("/dashboard");

    const signup = page.getByRole("form", {
      name: "The daily briefing on AI work",
    });
    await expect(
      signup.getByLabel("Your email for the newsletter"),
    ).toHaveValue(email);
  });
});
