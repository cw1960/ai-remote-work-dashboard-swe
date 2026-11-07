/**
 * schema.org JobPosting for a job page, so search engines can show it in
 * job search. Built only from what we store: title, summary, pay, dates and
 * countries. Closed jobs get none (the page is noindex).
 */
import type { JobDetail } from "./queries";

type PayUnit = NonNullable<JobDetail["pay_unit"]>;

/** schema.org unitText for the pay units it defines. */
const UNIT_TEXT: Partial<Record<PayUnit, string>> = {
  hour: "HOUR",
  day: "DAY",
  week: "WEEK",
  month: "MONTH",
  year: "YEAR",
};

export function jobPostingJsonLd(
  job: JobDetail,
  pageUrl: string,
): Record<string, unknown> | null {
  if (job.status !== "open") return null;

  const pay = [job.pay_min, job.pay_max].filter(
    (value): value is number => value !== null && value > 0,
  );
  const unitText = job.pay_unit ? UNIT_TEXT[job.pay_unit] : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.summary ?? job.title,
    datePosted: job.posted_at ?? job.first_seen_at,
    url: pageUrl,
    employmentType: "CONTRACTOR",
    jobLocationType: "TELECOMMUTE",
    ...(job.countries.length > 0 && {
      applicantLocationRequirements: job.countries.map((code) => ({
        "@type": "Country",
        name: code,
      })),
    }),
    hiringOrganization: {
      "@type": "Organization",
      name: job.platform.name,
      sameAs: job.platform.site_url,
    },
    directApply: false,
    ...(pay.length > 0 &&
      unitText && {
        baseSalary: {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: {
            "@type": "QuantitativeValue",
            minValue: Math.min(...pay),
            maxValue: Math.max(...pay),
            unitText,
          },
        },
      }),
  };
}

/** JSON for a <script> tag: "<" is escaped so the text can't close it. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
