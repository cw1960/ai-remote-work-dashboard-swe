import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { StateBlock } from "@/components/state-block";
import { siteConfig } from "@/config/site";
import { countryName, formatPayAmount } from "@/lib/jobs/format";
import {
  type AdminListing,
  getAdminListings,
  getAdminPlatforms,
  isAdmin,
} from "@/lib/listings/queries";

import { AdminNav } from "../admin-nav";
import { ListingActions } from "./listing-actions";
import { ListingForm } from "./listing-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminListings");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Owner-only: hand-picked listings for the newsletter. Anyone else gets the
 * ordinary "page not found", so the page doesn't reveal it exists.
 */
export default async function AdminListingsPage() {
  if (!(await isAdmin())) notFound();
  const [t, locale, platforms, listings] = await Promise.all([
    getTranslations("AdminListings"),
    getLocale(),
    getAdminPlatforms(),
    getAdminListings(),
  ]);

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-2 mb-6 text-muted-foreground">
          {t("intro", { newsletter: siteConfig.newsletter.name })}
        </p>
        <AdminNav current="listings" />

        <div>
          <ListingForm platforms={platforms} />
        </div>

        <section aria-labelledby="listings-heading" className="mt-12">
          <h2 id="listings-heading" className="text-xl font-extrabold">
            {t("listTitle")}
          </h2>
          {listings.length === 0 ? (
            <div className="mt-4">
              <StateBlock
                icon={Inbox}
                title={t("empty")}
                copy={t("emptyHint")}
              />
            </div>
          ) : (
            <ul className="mt-4 grid gap-3">
              {listings.map((listing) => (
                <ListingItem
                  key={listing.id}
                  listing={listing}
                  locale={locale}
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

async function ListingItem({
  listing,
  locale,
}: {
  listing: AdminListing;
  locale: string;
}) {
  const t = await getTranslations("AdminListings");
  const open = listing.status === "open";
  const amount = formatPayAmount(listing.pay_min, listing.pay_max, locale);
  const pay = amount
    ? listing.pay_unit
      ? `${amount} / ${t(`units.${listing.pay_unit}`)}`
      : amount
    : t("payNotListed");
  const countries =
    listing.countries.length > 0
      ? listing.countries.map((code) => countryName(code, locale)).join(", ")
      : t("anywhere");
  const checked = listing.verified_at
    ? t("checked", {
        date: new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(new Date(listing.verified_at)),
      })
    : t("notChecked");

  return (
    <li className="grid gap-2 rounded-2xl border border-border p-4 glass-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:underline"
          >
            {listing.title}
          </a>
        </h3>
        <span className="text-xs font-bold text-muted-foreground uppercase">
          {open ? t("statusOpen") : t("statusClosed")}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {[listing.platform_name, pay, countries, checked].join(" · ")}
      </p>
      {listing.review_of && (
        <p className="text-sm">
          <span className="font-semibold">{t("reviewNote")}</span>{" "}
          {listing.review_url ? (
            <a
              href={listing.review_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              {listing.review_title}
            </a>
          ) : (
            listing.review_title
          )}
        </p>
      )}
      {open && (
        <ListingActions
          id={listing.id}
          title={listing.title}
          inReview={listing.review_of !== null}
        />
      )}
    </li>
  );
}
