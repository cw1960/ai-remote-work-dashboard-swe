import { Clock3, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  ApplyButton,
  ReferralDisclosure,
} from "@/components/jobs/apply-button";
import { TrackButton } from "@/components/track-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Domain } from "@/lib/jobs/filters";
import {
  countryName,
  formatPayAmount,
  formatPostedAgo,
  languageName,
} from "@/lib/jobs/format";
import type { JobCardData } from "@/lib/jobs/queries";
import type { MatchReasons } from "@/lib/matching/reasons";

/** Where "Track this" sends signed-out visitors: sign in, then track. */
export function trackSignInHref(jobId: string): string {
  return `/sign-in?next=${encodeURIComponent(`/jobs/${jobId}?track=1`)}`;
}

export function JobCard({
  job,
  tracked,
  match,
}: {
  job: JobCardData;
  /** Whether the user tracks this job; null when signed out. */
  tracked: boolean | null;
  /** Why the job fits the signed-in user, when it does. */
  match?: MatchReasons | undefined;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const amount = formatPayAmount(job.pay_min, job.pay_max, locale);
  const tags = [
    job.domain ? t(`Domains.${job.domain as Domain}`) : null,
    job.languages.map((code) => languageName(code, locale)).join(", ") || null,
    job.countries
      .slice(0, 2)
      .map((code) => countryName(code, locale))
      .join(", ") || null,
  ].filter((tag): tag is string => tag !== null);

  return (
    <article className="rounded-2xl border border-border p-4 glass-panel sm:p-5">
      <h3 className="text-base font-bold sm:text-lg">
        <Link href={`/jobs/${job.id}`} className="rounded hover:underline">
          {job.title}
        </Link>
      </h3>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className="grid size-6 place-items-center rounded-md text-[11px] font-bold text-primary-foreground gradient-primary"
          aria-hidden="true"
        >
          {job.platform.name.charAt(0).toUpperCase()}
        </span>
        {job.platform.name}
      </p>
      <p className="mt-3 text-lg font-extrabold">
        {amount
          ? t("Job.pay", { amount, unit: job.pay_unit ?? "other" })
          : t("Job.noPay")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="border-border bg-secondary text-secondary-foreground"
          >
            {tag}
          </Badge>
        ))}
        {job.posted_at && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3" aria-hidden="true" />
            {t("Feed.postedAgo", {
              ago: formatPostedAgo(job.posted_at, locale),
            })}
          </span>
        )}
      </div>
      {match && <MatchLine reasons={match} />}
      {job.summary && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {job.summary}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <TrackButton
          target={{ kind: "job", id: job.id }}
          tracked={tracked}
          signInHref={trackSignInHref(job.id)}
        />
        <ApplyButton jobId={job.id} platform={job.platform.name} />
      </div>
      {job.platform.has_referral && (
        <ReferralDisclosure className="mt-2 sm:text-right" />
      )}
    </article>
  );
}

/** "Fits you: Law, Spanish, meets your rate" */
function MatchLine({ reasons }: { reasons: MatchReasons }) {
  const t = useTranslations();
  const locale = useLocale();
  const parts = [
    reasons.domain ? t(`Domains.${reasons.domain as Domain}`) : null,
    reasons.languages.length > 0
      ? t("Match.reasonLanguages", {
          languages: new Intl.ListFormat(locale, { type: "unit" }).format(
            reasons.languages.map((code) => languageName(code, locale)),
          ),
        })
      : null,
    reasons.payOk ? t("Match.reasonPay") : null,
    reasons.country
      ? t("Match.reasonCountry", {
          country: countryName(reasons.country, locale),
        })
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-primary">
      <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {t("Match.fitsYou")}{" "}
        <span className="text-foreground">
          {new Intl.ListFormat(locale, { type: "conjunction" }).format(parts)}
        </span>
      </span>
    </p>
  );
}

export function JobCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-5"
      aria-hidden="true"
    >
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-2 h-4 w-28" />
      <Skeleton className="mt-4 h-6 w-32" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  );
}
