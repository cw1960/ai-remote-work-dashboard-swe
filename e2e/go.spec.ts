import { expect, test } from "@playwright/test";

// Runs against the local Supabase stack seeded with supabase/seed.sql, whose
// job ids are md5(external_id)::uuid.
const MERCOR_JOB = "4a37209f-fc53-5133-2ed2-a505cc4c279a"; // seed-mercor-01
const MICRO1_JOB = "fa1e4a0c-cd30-7714-e00f-2b5d9e129da3"; // seed-micro1-03
const CLOSED_JOB = "0912f11a-d0a4-50be-6384-50c7f9ca434d"; // seed-mercor-13

test.describe("apply redirect", () => {
  test("sends Mercor clicks to the listing with the referral code", async ({
    request,
  }) => {
    const response = await request.get(`/go/${MERCOR_JOB}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe(
      "https://work.mercor.com/explore?listingId=seed-mercor-01&referralCode=00000000-0000-4000-8000-000000000002",
    );
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("sends micro1 clicks to the job post with the referral code", async ({
    request,
  }) => {
    const response = await request.get(`/go/${MICRO1_JOB}`, {
      maxRedirects: 0,
    });
    expect(response.headers().location).toBe(
      "https://jobs.micro1.ai/post/seed-micro1-03?referralCode=00000000-0000-4000-8000-000000000001&utm_source=referral&utm_medium=share&utm_campaign=job_referral",
    );
  });

  test("sends closed and unknown jobs back to their job page", async ({
    request,
  }) => {
    for (const id of [CLOSED_JOB, "not-a-job"]) {
      const response = await request.get(`/go/${id}`, { maxRedirects: 0 });
      expect(response.status()).toBe(303);
      // Relative, so it keeps the host the visitor used.
      expect(response.headers().location).toBe(`/jobs/${id}`);
    }
  });

  test("is kept out of search engines", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /go/");
  });
});

test.describe("apply buttons", () => {
  test("the job page applies through /go with the disclosure", async ({
    page,
  }) => {
    await page.goto(`/jobs/${MERCOR_JOB}`);

    // "Apply on Mercor" on desktop; "Apply" in the phone bar.
    const apply = page
      .getByTestId("job-actions")
      .filter({ visible: true })
      .getByRole("link", { name: /^Apply( on Mercor)? \(opens Mercor/ });
    await expect(apply).toBeVisible();
    await expect(apply).toHaveAttribute("href", `/go/${MERCOR_JOB}`);
    await expect(apply).toHaveAttribute("target", "_blank");
    await expect(
      page
        .getByText(
          "We may earn a referral fee if you're hired. It never costs you anything.",
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });

  test("a closed job has no Apply button", async ({ page }) => {
    await page.goto(`/jobs/${CLOSED_JOB}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Apply on Mercor/ }),
    ).toHaveCount(0);
  });

  test("every feed card applies through /go", async ({ page }) => {
    await page.goto("/?q=translator");

    const card = page
      .getByRole("list", { name: "Job results" })
      .getByRole("article");
    await expect(card.getByRole("link", { name: /^Apply/ })).toHaveAttribute(
      "href",
      `/go/${MICRO1_JOB}`,
    );
  });
});
