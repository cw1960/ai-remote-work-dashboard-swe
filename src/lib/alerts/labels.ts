import "server-only";

import { getTranslations } from "next-intl/server";

import { type routing } from "@/i18n/routing";
import { countryName, formatPayAmount, languageName } from "@/lib/jobs/format";

import type { DescribeLabels } from "./saved-search";

/** Words for describing saved searches, in a locale. */
export async function describeLabels(
  locale: (typeof routing.locales)[number],
): Promise<DescribeLabels> {
  const [t, tDomains] = await Promise.all([
    getTranslations({ locale, namespace: "SavedSearches" }),
    getTranslations({ locale, namespace: "Domains" }),
  ]);
  return {
    quoted: (q) => t("quoted", { q }),
    domain: (domain) => tDomains(domain),
    language: (code) => languageName(code, locale),
    country: (code) => countryName(code, locale),
    minPay: (amount) =>
      t("minPay", { amount: formatPayAmount(amount, amount, locale) ?? "" }),
    allJobs: t("allJobs"),
  };
}
