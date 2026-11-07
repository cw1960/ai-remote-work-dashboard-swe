import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { EmailPrefsForm } from "@/components/email-prefs-form";
import { ForwardingAddress } from "@/components/forwarding-address";
import { SavedSearchList } from "@/components/saved-search-list";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/config/site";
import { redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { describeLabels } from "@/lib/alerts/labels";
import { getSavedSearches } from "@/lib/alerts/queries";
import { describeSearch, toFeedFilters } from "@/lib/alerts/saved-search";
import { updateMyEmailPrefs } from "@/lib/email/actions";
import { emailLocale } from "@/lib/email/messages";
import { getServerEnv } from "@/lib/env";
import { toSearchParams } from "@/lib/jobs/filters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("EmailSettings");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Signed-in email settings. */
export default async function SettingsPage() {
  const [locale, user] = await Promise.all([getLocale(), getSessionUser()]);
  if (!user) {
    redirect({ href: "/sign-in?next=%2Fsettings", locale });
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const [t, tSaved, tInbound, labels, searches, { data, error }] =
    await Promise.all([
      getTranslations("EmailSettings"),
      getTranslations("SavedSearches"),
      getTranslations("Inbound"),
      describeLabels(emailLocale(locale)),
      getSavedSearches(),
      supabase
        .from("email_prefs")
        .select("alerts_on, reminders_on, recap_on, inbound_token")
        .eq("user_id", user.id)
        .single(),
    ]);
  if (error) throw new Error(error.message);
  const items = searches.map((search) => {
    const query = toSearchParams(toFeedFilters(search.filters)).toString();
    return {
      id: search.id,
      description: describeSearch(search.filters, search.platformNames, labels),
      frequency: search.frequency,
      href: query ? `/jobs?${query}` : "/jobs",
    };
  });

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("subtitle", { email: user.email ?? "" })}
        </p>
        <div className="mt-8">
          <EmailPrefsForm
            initial={{
              alerts_on: data.alerts_on,
              reminders_on: data.reminders_on,
              recap_on: data.recap_on,
            }}
            save={updateMyEmailPrefs}
          />
        </div>

        <section aria-labelledby="saved-searches" className="mt-12">
          <h2 id="saved-searches" className="text-xl font-extrabold">
            {tSaved("heading")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.alerts_on ? tSaved("intro") : tSaved("alertsOff")}
          </p>
          <div className="mt-3">
            <SavedSearchList initial={items} />
          </div>
        </section>

        {getServerEnv().INBOUND_EMAIL_ENABLED && (
          <section aria-labelledby="track-by-email" className="mt-12">
            <h2 id="track-by-email" className="text-xl font-extrabold">
              {tInbound("heading")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tInbound("intro")}
            </p>
            <div className="mt-3">
              <ForwardingAddress
                address={`track+${data.inbound_token}@${siteConfig.inboundDomain}`}
              />
            </div>
            <h3 className="mt-5 text-sm font-bold">{tInbound("howTitle")}</h3>
            <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm">
              <li>{tInbound("how1")}</li>
              <li>{tInbound("how2")}</li>
              <li>{tInbound("how3")}</li>
            </ol>
            <p className="mt-3 text-sm">{tInbound("tip")}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {tInbound("privacy")}
            </p>
          </section>
        )}
      </main>
    </>
  );
}
