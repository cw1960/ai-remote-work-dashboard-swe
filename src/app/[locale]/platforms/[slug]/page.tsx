import { Ban, ChevronRight, ExternalLink, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumbs, Fact, PlatformMark } from "@/components/jobs/detail";
import { JobCard } from "@/components/jobs/job-card";
import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { StateBlock } from "@/components/state-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { countryName } from "@/lib/jobs/format";
import { TrackButton } from "@/components/track-button";
import { getSessionUser } from "@/lib/auth/session";
import { getPlatform, getPlatformJobs } from "@/lib/jobs/queries";
import { isPlatformTracked, trackedLookup } from "@/lib/tracker/queries";

const LATEST_JOBS = 5;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/platforms/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [platform, t] = await Promise.all([
    getPlatform(slug),
    getTranslations("PlatformPage"),
  ]);
  if (!platform) return { title: t("notFoundTitle") };

  const { total } = await getPlatformJobs(platform.slug);
  const title = t("metaTitle", { platform: platform.name });
  const description = t("metaDescription", {
    platform: platform.name,
    count: total,
  });
  return {
    title,
    description,
    alternates: { canonical: `/platforms/${platform.slug}` },
    openGraph: { title, description },
  };
}

/** A platform's page: how joining works, key facts, its newest jobs. */
export default async function PlatformPage({
  params,
  searchParams,
}: PageProps<"/[locale]/platforms/[slug]">) {
  const { slug } = await params;
  // Loaded before anything streams, so an unknown platform is a real 404.
  const platform = await getPlatform(slug);
  if (!platform) notFound();

  const [{ jobs, total }, t, tJobs, locale] = await Promise.all([
    getPlatformJobs(platform.slug),
    getTranslations("PlatformPage"),
    getTranslations("JobPage"),
    getLocale(),
  ]);
  const [isTracked, user, query] = await Promise.all([
    trackedLookup(jobs.map((job) => job.id)),
    getSessionUser(),
    searchParams,
  ]);
  const platformTracked = user ? await isPlatformTracked(platform.slug) : null;
  const siteLabel = platform.site_url.replace(/^https:\/\/(www\.)?/, "");
  const feedHref = `/?platform=${platform.slug}`;

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main
        id="main"
        className="mx-auto w-full max-w-[1100px] px-4 pt-6 pb-16 sm:px-6"
      >
        <Breadcrumbs
          label={tJobs("breadcrumb")}
          items={[
            { label: tJobs("jobs"), href: "/" },
            { label: tJobs("platforms") },
            { label: platform.name },
          ]}
        />

        <div className="grid gap-6">
          <section className="flex flex-wrap items-start gap-4">
            <PlatformMark
              name={platform.name}
              className="size-16 rounded-2xl text-2xl font-extrabold"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
                {platform.name}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="gap-1">
                  <Inbox className="size-3.5" aria-hidden="true" />
                  {t("openJobs", { count: total })}
                </Badge>
                <a
                  href={platform.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 rounded px-1 underline-offset-4 hover:underline"
                >
                  {siteLabel}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{t("opensInNewTab")}</span>
                </a>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TrackButton
                  target={{ kind: "platform", slug: platform.slug }}
                  tracked={platformTracked}
                  signInHref={`/sign-in?next=${encodeURIComponent(`/platforms/${platform.slug}?track=1`)}`}
                  autoTrack={query.track === "1"}
                />
              </div>
            </div>
          </section>

          <section
            aria-labelledby="how-joining"
            className="rounded-2xl border border-border p-5 glass-panel"
          >
            <h2 id="how-joining" className="text-lg font-bold">
              {t("howJoining")}
            </h2>
            <p className="mt-2 text-sm text-foreground/85">
              {platform.onboarding_notes ??
                t("noNotes", { platform: platform.name })}
            </p>
          </section>

          <dl aria-label={t("facts")} className="grid gap-3 sm:grid-cols-3">
            <Fact icon={Ban} label={t("notAvailableIn")}>
              {platform.countries_blocked
                .map((code) => countryName(code, locale))
                .join(", ") || t("noLimits")}
            </Fact>
          </dl>

          <section aria-labelledby="platform-jobs">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="platform-jobs" className="text-lg font-bold">
                {t("jobsHeading", { platform: platform.name })}
              </h2>
              {total > LATEST_JOBS && (
                <Link
                  href={feedHref}
                  className="inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-semibold text-primary hover:underline"
                >
                  {t("seeAll", { count: total, platform: platform.name })}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>
            {jobs.length === 0 ? (
              <StateBlock
                icon={Inbox}
                title={t("emptyTitle", { platform: platform.name })}
                copy={t("emptyBody")}
                action={
                  <Button asChild variant="editorialOutline" size="touch">
                    <Link href="/">{t("browseAll")}</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-3">
                {jobs.slice(0, LATEST_JOBS).map((job) => (
                  <li key={job.id}>
                    <JobCard job={job} tracked={isTracked(job.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
