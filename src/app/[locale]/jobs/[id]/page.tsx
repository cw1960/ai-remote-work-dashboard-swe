import {
  Ban,
  Briefcase,
  ChevronRight,
  Globe2,
  Languages,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs, Fact, PlatformMark } from "@/components/jobs/detail";
import {
  ApplyButton,
  ReferralDisclosure,
} from "@/components/jobs/apply-button";
import {
  JobCard,
  JobCardSkeleton,
  trackSignInHref,
} from "@/components/jobs/job-card";
import { AccountNav } from "@/components/account-nav";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { PlaybookTip } from "@/components/playbook/promo";
import { TailorSection } from "@/components/resume/tailor-section";
import { SiteHeader } from "@/components/site-header";
import { TrackButton } from "@/components/track-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getSiteUrl } from "@/lib/env";
import type { Domain } from "@/lib/jobs/filters";
import {
  countryName,
  formatPayAmount,
  formatPostedAgo,
  languageName,
} from "@/lib/jobs/format";
import { getJob, getSimilarJobs, type JobDetail } from "@/lib/jobs/queries";
import { trackedLookup } from "@/lib/tracker/queries";
import { jobPostingJsonLd, serializeJsonLd } from "@/lib/jobs/structured-data";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/jobs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const [job, t, tJob, locale] = await Promise.all([
    getJob(id),
    getTranslations("JobPage"),
    getTranslations("Job"),
    getLocale(),
  ]);
  if (!job) return { title: t("notFoundTitle") };

  const amount = formatPayAmount(job.pay_min, job.pay_max, locale);
  const pay = amount
    ? tJob("pay", { amount, unit: job.pay_unit ?? "other" })
    : tJob("noPay");
  const title = t("metaTitle", {
    title: job.title,
    platform: job.platform.name,
  });
  const description = t("metaDescription", {
    title: job.title,
    platform: job.platform.name,
    pay,
  });
  return {
    title,
    description,
    alternates: { canonical: `/jobs/${job.id}` },
    openGraph: { type: "article", title, description },
    // Closed jobs stay reachable from old links but leave search results.
    robots: job.status === "open" ? undefined : { index: false },
  };
}

/** A job's page: key facts, how joining works, similar jobs. */
export default async function JobPage({
  params,
  searchParams,
}: PageProps<"/[locale]/jobs/[id]">) {
  const { id } = await params;
  // Loaded before anything streams, so an unknown job is a real 404.
  const job = await getJob(id);
  if (!job) notFound();

  const [t, tJob, tDomains, tPromo, locale] = await Promise.all([
    getTranslations("JobPage"),
    getTranslations("Job"),
    getTranslations("Domains"),
    getTranslations("PlaybookPromo"),
    getLocale(),
  ]);
  const closed = job.status !== "open";
  const [isTracked, query] = await Promise.all([
    trackedLookup([job.id]),
    searchParams,
  ]);
  const track = (
    <TrackButton
      target={{ kind: "job", id: job.id }}
      tracked={isTracked(job.id)}
      signInHref={trackSignInHref(job.id)}
      autoTrack={query.track === "1"}
    />
  );
  const amount = formatPayAmount(job.pay_min, job.pay_max, locale);
  const blocked = [
    ...new Set([...job.platform.countries_blocked, ...job.countries_blocked]),
  ];
  const platformHref = `/platforms/${job.platform.slug}`;
  const jsonLd = jobPostingJsonLd(
    job,
    new URL(`/jobs/${job.id}`, getSiteUrl()).toString(),
  );

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main
        id="main"
        className={cn(
          "mx-auto w-full max-w-[1100px] px-4 pt-6 pb-16 sm:px-6",
          // Room for the fixed Apply bar on phones.
          !closed && "pb-36 md:pb-16",
        )}
      >
        {jsonLd && (
          <script
            type="application/ld+json"
            // Escaped by serializeJsonLd; built only from our own columns.
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
          />
        )}

        <Breadcrumbs
          label={t("breadcrumb")}
          items={[
            { label: t("jobs"), href: "/" },
            { label: job.platform.name, href: platformHref },
            { label: job.title },
          ]}
        />

        {closed && (
          <div
            role="status"
            className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/35 bg-destructive/10 p-4"
          >
            <Ban
              className="mt-0.5 size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold">{t("closed")}</p>
              <p className="text-sm text-foreground/85">
                {t("closedBody", {
                  platform: job.platform.name,
                  date: job.closed_at
                    ? new Intl.DateTimeFormat(locale, {
                        day: "numeric",
                        month: "short",
                      }).format(new Date(job.closed_at))
                    : "none",
                })}
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-5">
          <header className="rounded-2xl border border-border p-5 glass-panel sm:p-6">
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
              {job.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <Link
                href={platformHref}
                className="inline-flex min-h-11 items-center gap-2 rounded font-semibold text-foreground hover:underline"
              >
                <PlatformMark
                  name={job.platform.name}
                  className="size-7 text-xs"
                />
                {job.platform.name}
              </Link>
              {job.posted_at && (
                <span>
                  {t("posted", { ago: formatPostedAgo(job.posted_at, locale) })}
                </span>
              )}
              {closed && (
                <Badge
                  variant="outline"
                  className="gap-1 border-destructive/35 bg-destructive/10 text-foreground"
                >
                  <Ban className="size-3" aria-hidden="true" />
                  {t("closed")}
                </Badge>
              )}
            </div>

            <dl
              aria-label={t("facts")}
              className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              <Fact icon={Wallet} label={t("pay")}>
                {amount
                  ? tJob("pay", { amount, unit: job.pay_unit ?? "other" })
                  : tJob("noPay")}
              </Fact>
              {job.domain && (
                <Fact icon={Briefcase} label={t("domain")}>
                  {tDomains(job.domain as Domain)}
                </Fact>
              )}
              <Fact icon={Languages} label={t("languages")}>
                {job.languages
                  .map((code) => languageName(code, locale))
                  .join(", ") || t("anyLanguage")}
              </Fact>
              <Fact icon={Globe2} label={t("openTo")}>
                {job.countries
                  .map((code) => countryName(code, locale))
                  .join(", ") || t("anywhere")}
              </Fact>
              {blocked.length > 0 && (
                <Fact icon={Ban} label={t("notAvailableIn")}>
                  {blocked.map((code) => countryName(code, locale)).join(", ")}
                </Fact>
              )}
            </dl>

            {job.summary && (
              <p className="mt-5 text-base leading-relaxed">{job.summary}</p>
            )}
            {!closed && (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("fullDetails", { platform: job.platform.name })}
                </p>
                <div
                  data-testid="job-actions"
                  className="mt-5 hidden gap-2 md:grid"
                >
                  <div className="flex flex-wrap gap-2">
                    <ApplyButton
                      jobId={job.id}
                      platform={job.platform.name}
                      long
                    />
                    {track}
                  </div>
                  {job.platform.has_referral && <ReferralDisclosure />}
                </div>
              </>
            )}
          </header>

          <TailorSection
            jobId={job.id}
            jobTitle={job.title}
            company={job.platform.name}
            open={!closed}
            autoOpen={query.tailor === "1"}
          />

          <section
            aria-labelledby="how-joining"
            className="rounded-2xl border border-border p-5 glass-panel"
          >
            <h2 id="how-joining" className="font-bold">
              {t("howJoining", { platform: job.platform.name })}
            </h2>
            <p className="mt-2 text-sm text-foreground/85">
              {job.platform.onboarding_notes ??
                t("noNotes", { platform: job.platform.name })}
            </p>
            <Link
              href={platformHref}
              className="mt-3 inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-primary hover:underline"
            >
              {t("platformGuide", { platform: job.platform.name })}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
            {job.platform.slug === "micro1" && (
              <PlaybookTip
                message={tPromo("micro1")}
                refTag="micro1-job"
                className="mt-2"
              />
            )}
          </section>

          <NewsletterSignup
            source="job"
            className="rounded-2xl border border-border p-5 glass-panel"
          />
        </div>

        <Suspense
          fallback={
            <section
              aria-busy="true"
              aria-label={t("loadingSimilar")}
              className="mt-8"
            >
              <Skeleton className="h-6 w-40" />
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <JobCardSkeleton key={i} />
                ))}
              </div>
            </section>
          }
        >
          <SimilarJobs
            job={job}
            heading={closed ? t("similarOpen") : t("similar")}
          />
        </Suspense>
      </main>

      {!closed && (
        <div
          data-testid="job-actions"
          data-bottom-bar
          className="fixed inset-x-0 bottom-0 z-30 grid gap-1 border-t border-border bg-background/90 p-3 backdrop-blur-xl md:hidden"
        >
          <div className="grid grid-cols-2 gap-2">
            {track}
            <ApplyButton jobId={job.id} platform={job.platform.name} />
          </div>
          {job.platform.has_referral && (
            <ReferralDisclosure className="text-center" />
          )}
        </div>
      )}
    </>
  );
}

async function SimilarJobs({
  job,
  heading,
}: {
  job: JobDetail;
  heading: string;
}) {
  const similar = await getSimilarJobs(job);
  const isTracked = await trackedLookup(similar.map((item) => item.id));
  if (similar.length === 0) return null;
  return (
    <section aria-labelledby="similar" className="mt-8">
      <h2 id="similar" className="text-lg font-bold">
        {heading}
      </h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {similar.map((item) => (
          <li key={item.id}>
            <JobCard job={item} tracked={isTracked(item.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
