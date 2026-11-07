import { ArrowRight, SearchCheck, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { JobCard } from "@/components/jobs/job-card";
import { StateBlock } from "@/components/state-block";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { MatchedJob } from "@/lib/matching/queries";

/** Dashboard zone: open jobs that fit the user's profile, best first. */
export async function MatchedJobs({
  matches,
  canMatch,
}: {
  matches: MatchedJob[];
  /** Whether the profile has a field or a language to match on. */
  canMatch: boolean;
}) {
  const t = await getTranslations("Match");

  return (
    <section aria-labelledby="matched-title" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-primary uppercase">
            {t("eyebrow")}
          </p>
          <h2 id="matched-title" className="mt-1 text-2xl font-extrabold">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {matches.length > 0 && (
          <Button asChild variant="editorialLink" size="touch" className="px-0">
            <Link href="/jobs">
              {t("seeAll")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-5">
        {!canMatch ? (
          <StateBlock
            icon={UserRound}
            title={t("profileTitle")}
            copy={t("profileBody")}
            action={
              <Button asChild variant="editorial" size="touch">
                <Link href="/onboarding?next=%2Fdashboard">
                  {t("profileCta")}
                </Link>
              </Button>
            }
          />
        ) : matches.length === 0 ? (
          <StateBlock
            icon={SearchCheck}
            title={t("emptyTitle")}
            copy={t("emptyBody")}
            action={
              <Button asChild variant="editorial" size="touch">
                <Link href="/jobs">{t("seeAll")}</Link>
              </Button>
            }
          />
        ) : (
          <ul
            className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3"
            aria-labelledby="matched-title"
          >
            {matches.map(({ job, reasons }) => (
              <li key={job.id}>
                <JobCard job={job} tracked={false} match={reasons} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
