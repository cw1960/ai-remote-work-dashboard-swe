import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { redirect } from "@/i18n/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { DOMAINS } from "@/lib/jobs/filters";
import { countryName, languageName } from "@/lib/jobs/format";
import { COUNTRY_CODES } from "@/lib/jobs/options";
import { getOnboardingData } from "@/lib/profile/queries";

import { LANGUAGE_CODES } from "../../../../supabase/functions/_shared/ingest/languages";
import { OnboardingWizard, type WizardOptions } from "./onboarding-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** The 5-step profile; also where signed-in users edit it later. */
export default async function OnboardingPage({
  searchParams,
}: PageProps<"/[locale]/onboarding">) {
  const [params, locale, data] = await Promise.all([
    searchParams,
    getLocale(),
    getOnboardingData(),
  ]);
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : null,
  );
  if (!data) {
    redirect({
      href: `/sign-in?next=${encodeURIComponent(`/onboarding?next=${encodeURIComponent(next)}`)}`,
      locale,
    });
    return null;
  }

  // Names resolved on the server: Intl data differs between Node and
  // browsers, so client-side names would cause hydration mismatches.
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, locale);
  const options: WizardOptions = {
    domains: DOMAINS.filter((domain) => domain !== "other"),
    languages: LANGUAGE_CODES.map((code) => ({
      code,
      name: languageName(code, locale),
    })).sort(byName),
    countries: COUNTRY_CODES.map((code) => ({
      code,
      name: countryName(code, locale),
    })).sort(byName),
  };

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="w-full flex-1 px-4 pt-6 sm:px-6 lg:px-8">
        <OnboardingWizard
          data={data}
          options={options}
          doneHref={next === "/" ? "/dashboard" : next}
        />
      </main>
    </>
  );
}
