import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { MasterProfileForm } from "@/components/resume/master-profile-form";
import { MasterResumeCard } from "@/components/resume/master-resume-card";
import { SiteHeader } from "@/components/site-header";
import { StateBlock } from "@/components/state-block";
import { Badge } from "@/components/ui/badge";
import { Link, redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/next-path";
import { formatDay } from "@/lib/resume/format";
import {
  getMasterProfile,
  getTailoringUsage,
  listTailoredResumes,
} from "@/lib/resume/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Resume");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * The Master Profile (the resume text, from an upload or pasted, and the
 * core skills and evidence), and every tailored resume made from it.
 */
export default async function ResumePage({
  searchParams,
}: PageProps<"/[locale]/resume">) {
  const [locale, user, query] = await Promise.all([
    getLocale(),
    getSessionUser(),
    searchParams,
  ]);
  const rawNext = typeof query.next === "string" ? query.next : null;
  // Only back to a job page: the Tailor button is the one that sends here.
  const next =
    rawNext &&
    /^\/jobs\/[0-9a-f-]{36}(\?tailor=1)?$/.test(safeNextPath(rawNext))
      ? rawNext
      : null;
  if (!user) {
    const here = next ? `/resume?next=${encodeURIComponent(next)}` : "/resume";
    redirect({ href: `/sign-in?next=${encodeURIComponent(here)}`, locale });
    return null;
  }

  const [t, master, tailored, usage] = await Promise.all([
    getTranslations("Resume"),
    getMasterProfile(),
    listTailoredResumes(),
    getTailoringUsage(),
  ]);

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        {next && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-primary/35 bg-primary/10 p-3 text-sm"
          >
            {t("returnNotice")}
          </p>
        )}

        <section aria-labelledby="master-heading" className="mt-8">
          <h2 id="master-heading" className="text-xl font-extrabold">
            {t("masterHeading")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("masterIntro")}
          </p>
          <div className="mt-3">
            <MasterResumeCard
              master={
                master
                  ? {
                      fileName: master.fileName,
                      fileType: master.fileType,
                      updatedAt: master.updatedAt,
                    }
                  : null
              }
              next={next}
            />
          </div>
        </section>

        <section aria-labelledby="profile-heading" className="mt-10">
          <h2 id="profile-heading" className="text-xl font-extrabold">
            {t("profileHeading")}
          </h2>
          <div className="mt-3">
            {/* Keyed by version, so an upload resets the text shown. */}
            <MasterProfileForm
              key={master?.id ?? "none"}
              content={master?.content ?? ""}
              evidence={master?.evidence ?? ""}
              next={next}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("privacy")}</p>
        </section>

        <section aria-labelledby="tailored-heading" className="mt-12">
          <h2 id="tailored-heading" className="text-xl font-extrabold">
            {t("tailoredHeading")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("usage", { used: usage.used, limit: usage.limit })}
          </p>
          <div className="mt-3">
            {tailored.length === 0 ? (
              <StateBlock
                icon={FileText}
                title={t("noneTitle")}
                copy={t("noneBody")}
                action={
                  <Link
                    href="/jobs"
                    className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                  >
                    {t("browseJobs")}
                  </Link>
                }
              />
            ) : (
              <ul className="grid gap-2">
                {tailored.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 glass-panel"
                  >
                    <div className="min-w-0">
                      <p className="font-bold">
                        <Link
                          href={`/resume/${item.id}`}
                          className="hover:underline"
                        >
                          {item.jobTitle}
                        </Link>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("itemMeta", {
                          company: item.company,
                          version: item.version,
                          date: formatDay(item.updatedAt, locale),
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge
                        variant="outline"
                        className={
                          item.status === "saved"
                            ? "border-success/40 bg-success/10"
                            : "border-border"
                        }
                      >
                        {t(`status.${item.status}`)}
                      </Badge>
                      <a
                        href={`/api/resumes/${item.id}/download?format=docx`}
                        className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                        aria-label={t("downloadFor", {
                          title: item.jobTitle,
                          version: item.version,
                        })}
                      >
                        {t("download")}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
