import { CircleAlert, FileCheck2, FileText, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDay } from "@/lib/resume/format";
import { getTailoringUsage, getTailorStatus } from "@/lib/resume/queries";

import { TailorButton } from "./tailor-button";

/**
 * The job page's resume panel: the tailoring status for this job, links to
 * a saved version, and "Tailor My Resume for This Job".
 */
export async function TailorSection({
  jobId,
  jobTitle,
  company,
  open,
  autoOpen,
}: {
  jobId: string;
  jobTitle: string;
  company: string;
  /** Closed jobs can't be tailored for; saved versions stay reachable. */
  open: boolean;
  autoOpen: boolean;
}) {
  const [t, locale, status] = await Promise.all([
    getTranslations("Tailor"),
    getLocale(),
    getTailorStatus(jobId),
  ]);
  const backHere = `/jobs/${jobId}?tailor=1`;

  let statusLine: React.ReactNode;
  if (status.kind === "signed_out") {
    statusLine = t("signedOut");
  } else if (status.kind === "none") {
    statusLine = (
      <>
        {t("statusNone")}
        {status.draft && (
          <>
            {" "}
            <Link
              href={`/resume/${status.draft.id}`}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("continueDraft")}
            </Link>
          </>
        )}
      </>
    );
  } else {
    statusLine = (
      <>
        {t("statusSaved", {
          version: status.latest.version,
          date: formatDay(
            status.latest.savedAt ?? status.latest.updatedAt,
            locale,
          ),
        })}{" "}
        <Link
          href={`/resume/${status.latest.id}`}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("view")}
        </Link>
        {" · "}
        <a
          href={`/api/resumes/${status.latest.id}/download?format=docx`}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("downloadWord")}
        </a>
      </>
    );
  }

  const Icon = status.kind === "saved" ? FileCheck2 : FileText;
  const usage =
    status.kind === "signed_out" || !open ? null : await getTailoringUsage();

  return (
    <section
      id="tailor"
      aria-labelledby="tailor-heading"
      className="scroll-mt-24 rounded-2xl border border-border p-5 glass-panel"
    >
      <h2 id="tailor-heading" className="flex items-center gap-2 font-bold">
        <Icon className="size-5 text-primary" aria-hidden="true" />
        {t("heading")}
      </h2>
      <p className="mt-2 text-sm text-foreground/85">{statusLine}</p>
      {status.kind === "saved" && status.outdated && (
        <p className="mt-2 flex items-start gap-2 text-sm">
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          {t("updateAvailable")}
        </p>
      )}

      {open && (
        <div className="mt-4">
          {status.kind === "signed_out" ? (
            <Button
              asChild
              variant="editorial"
              size="touch"
              className="w-full sm:w-auto"
            >
              <Link href={`/sign-in?next=${encodeURIComponent(backHere)}`}>
                <Sparkles aria-hidden="true" />
                {t("button")}
              </Link>
            </Button>
          ) : (
            <TailorButton
              jobId={jobId}
              jobTitle={jobTitle}
              company={company}
              hasMaster={status.hasMaster}
              listingHref={`/go/${jobId}`}
              autoOpen={autoOpen}
              remaining={Math.max(0, (usage?.limit ?? 0) - (usage?.used ?? 0))}
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t("explainer")}</p>
        </div>
      )}
    </section>
  );
}
