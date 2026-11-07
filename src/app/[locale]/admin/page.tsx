import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/config/site";
import {
  getSignupStats,
  getSiteStats,
  getSourceHealth,
} from "@/lib/admin/queries";
import { isAdmin } from "@/lib/listings/queries";

import { AdminNav } from "./admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.overview");
  return { title: t("metaTitle"), robots: { index: false } };
}

// Cells wrap long emails and errors so tables fit a phone without a
// sideways-scrolling region.
const cellClass =
  "border-b border-border px-3 py-2 text-left align-top wrap-anywhere";

/** Admin overview: site activity, newsletter signups, job source health. */
export default async function AdminPage() {
  if (!(await isAdmin())) notFound();
  const [t, locale, site, signups, sources] = await Promise.all([
    getTranslations("Admin.overview"),
    getLocale(),
    getSiteStats(),
    getSignupStats(),
    getSourceHealth(),
  ]);
  const number = new Intl.NumberFormat(locale);
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const tiles = [
    ["accounts", site.accounts],
    ["new7", site.new_7d],
    ["new30", site.new_30d],
    ["onboarded", site.onboarded],
    ["active7", site.active_7d],
    ["cards", site.cards],
    ["applied", site.applied],
  ] as const;

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-2 mb-6 text-muted-foreground">
          {t("intro", {
            name: siteConfig.name,
            newsletter: siteConfig.newsletter.name,
          })}
        </p>
        <AdminNav current="overview" />

        <section aria-labelledby="site-heading">
          <h2 id="site-heading" className="text-xl font-extrabold">
            {t("site.heading")}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-border p-4 glass-panel"
              >
                <dt className="text-sm text-muted-foreground">
                  {t(`site.${key}`)}
                </dt>
                <dd className="mt-1 text-2xl font-extrabold">
                  {number.format(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="signups-heading" className="mt-12">
          <h2 id="signups-heading" className="text-xl font-extrabold">
            {t("signups.heading")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("signups.intro")}
          </p>
          {signups.length === 0 ? (
            <p className="mt-4 text-sm">{t("signups.empty")}</p>
          ) : (
            <div className="mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={cellClass}>
                      {t("signups.form")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("signups.source")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("signups.campaign")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("signups.last7")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("signups.last30")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {signups.map((row) => (
                    <tr
                      key={`${row.source}|${row.utm_source ?? ""}|${row.utm_campaign ?? ""}`}
                    >
                      <td className={cellClass}>
                        {row.source === "footer" ||
                        row.source === "job" ||
                        row.source === "dashboard"
                          ? t(`signups.forms.${row.source}`)
                          : row.source}
                      </td>
                      <td className={cellClass}>
                        {row.utm_source ?? t("signups.none")}
                      </td>
                      <td className={cellClass}>
                        {row.utm_campaign ?? t("signups.none")}
                      </td>
                      <td className={cellClass}>
                        {number.format(row.last_7d)}
                      </td>
                      <td className={cellClass}>
                        {number.format(row.last_30d)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="sources-heading" className="mt-12">
          <h2 id="sources-heading" className="text-xl font-extrabold">
            {t("sources.heading")}
          </h2>
          {sources.length === 0 ? (
            <p className="mt-4 text-sm">{t("sources.empty")}</p>
          ) : (
            <div className="mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={cellClass}>
                      {t("sources.source")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("sources.lastRun")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("sources.found")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("sources.open")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("sources.status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((row) => (
                    <tr key={row.slug}>
                      <th scope="row" className={`${cellClass} font-semibold`}>
                        {row.name}
                        {row.newsletter_only && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {t("sources.newsletterOnly")}
                          </span>
                        )}
                      </th>
                      <td className={cellClass}>
                        {dateTime.format(new Date(row.last_started_at))} UTC
                      </td>
                      <td className={cellClass}>
                        {number.format(row.last_found)}
                      </td>
                      <td className={cellClass}>
                        {number.format(row.open_jobs)}
                      </td>
                      <td className={cellClass}>
                        {row.failures_in_row > 0 ? (
                          <span className="font-semibold text-destructive">
                            {t("sources.failing", {
                              count: row.failures_in_row,
                            })}
                            {row.last_error && (
                              <span className="block text-xs font-normal">
                                {row.last_error}
                              </span>
                            )}
                          </span>
                        ) : (
                          t("sources.ok")
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
