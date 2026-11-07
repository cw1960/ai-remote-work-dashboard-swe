import { describe, expect, it } from "vitest";

import type { JobDetail } from "./queries";
import { jobPostingJsonLd, serializeJsonLd } from "./structured-data";

const job: JobDetail = {
  id: "0b6b6c1e-8f0a-4c1c-9d59-2f5d3f1a0a01",
  title: "Spanish Legal Expert",
  summary: "Review legal reasoning written in Spanish.",
  domain: "law",
  tags: [],
  pay_min: 40,
  pay_max: 60,
  pay_unit: "hour",
  languages: ["es"],
  countries: ["MX", "ES"],
  posted_at: "2026-09-28T10:00:00Z",
  status: "open",
  closed_at: null,
  first_seen_at: "2026-09-28T12:00:00Z",
  countries_blocked: [],
  platform: {
    slug: "mercor",
    name: "Mercor",
    site_url: "https://www.mercor.com",
    onboarding_notes: null,
    countries_blocked: [],
    has_referral: true,
  },
};

const url = "https://example.com/jobs/0b6b6c1e-8f0a-4c1c-9d59-2f5d3f1a0a01";

describe("jobPostingJsonLd", () => {
  it("describes an open remote job with its pay", () => {
    expect(jobPostingJsonLd(job, url)).toEqual({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Spanish Legal Expert",
      description: "Review legal reasoning written in Spanish.",
      datePosted: "2026-09-28T10:00:00Z",
      url,
      employmentType: "CONTRACTOR",
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: [
        { "@type": "Country", name: "MX" },
        { "@type": "Country", name: "ES" },
      ],
      hiringOrganization: {
        "@type": "Organization",
        name: "Mercor",
        sameAs: "https://www.mercor.com",
      },
      directApply: false,
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: {
          "@type": "QuantitativeValue",
          minValue: 40,
          maxValue: 60,
          unitText: "HOUR",
        },
      },
    });
  });

  it("falls back on the title and first-seen date, and leaves out what is unknown", () => {
    const data = jobPostingJsonLd(
      {
        ...job,
        summary: null,
        posted_at: null,
        countries: [],
        pay_unit: "task",
      },
      url,
    );
    expect(data).toMatchObject({
      description: "Spanish Legal Expert",
      datePosted: "2026-09-28T12:00:00Z",
    });
    expect(data).not.toHaveProperty("applicantLocationRequirements");
    expect(data).not.toHaveProperty("baseSalary");
  });

  it("returns nothing for a closed job", () => {
    expect(
      jobPostingJsonLd(
        { ...job, status: "closed", closed_at: "2026-09-30T00:00:00Z" },
        url,
      ),
    ).toBeNull();
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so the JSON can't end its script tag", () => {
    expect(serializeJsonLd({ title: "</script><b>" })).toBe(
      '{"title":"\\u003c/script>\\u003cb>"}',
    );
  });
});
