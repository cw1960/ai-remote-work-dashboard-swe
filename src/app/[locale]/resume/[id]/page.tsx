import {
  ArrowLeft,
  CircleAlert,
  ListChecks,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AccountNav } from "@/components/account-nav";
import { ResumeEditor } from "@/components/resume/resume-editor";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Link, redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { formatDay } from "@/lib/resume/format";
import { getMasterResumeText, getTailoredResume } from "@/lib/resume/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Review");
  return { title: t("metaTitle"), robots: { index: false } };
}

function NoteList({
  icon: Icon,
  title,
  items,
  empty,
  tone,
}: {
  icon: typeof Sparkles;
  title: string;
  items: string[];
  empty: string;
  tone?: "warning";
}) {
  return (
    <section
      className={
        tone === "warning" && items.length > 0
          ? "rounded-2xl border border-destructive/35 bg-destructive/10 p-4"
          : "rounded-2xl border border-border p-4 glass-panel"
      }
    >
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** Review, edit, save and download one tailored resume. */
export default async function ReviewPage({
  params,
}: PageProps<"/[locale]/resume/[id]">) {
  const [{ id }, locale, user] = await Promise.all([
    params,
    getLocale(),
    getSessionUser(),
  ]);
  if (!z.guid().safeParse(id).success) notFound();
  if (!user) {
    redirect({
      href: `/sign-in?next=${encodeURIComponent(`/resume/${id}`)}`,
      locale,
    });
    return null;
  }

  const tailored = await getTailoredResume(id);
  if (!tailored) notFound();
  const [t, masterText] = await Promise.all([
    getTranslations("Review"),
    tailored.masterResumeId
      ? getMasterResumeText(tailored.masterResumeId)
      : null,
  ]);
  const { review } = tailored;

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main
        id="main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-16"
      >
        <Link
          href={`/jobs/${tailored.jobId}`}
          className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToJob")}
        </Link>

        <header className="mt-2">
          <p className="text-sm font-semibold text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
            {t("title", {
              title: tailored.jobTitle,
              company: tailored.company,
            })}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge
              variant="outline"
              className={
                tailored.status === "saved"
                  ? "border-success/40 bg-success/10"
                  : ""
              }
            >
              {t(`status.${tailored.status}`)}
            </Badge>
            {t("meta", {
              version: tailored.version,
              date: formatDay(tailored.createdAt, locale),
            })}
          </p>
        </header>

        <div
          role="note"
          className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/35 bg-primary/10 p-4"
        >
          <TriangleAlert
            className="mt-0.5 size-5 shrink-0"
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-bold">{t("verifyTitle")}</p>
            <p className="mt-1">{t("verifyBody")}</p>
          </div>
        </div>

        <section aria-labelledby="notes-heading" className="mt-6">
          <h2 id="notes-heading" className="text-lg font-extrabold">
            {t("notesHeading")}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {review.unverified.length > 0 && (
              <div className="md:col-span-2">
                <NoteList
                  icon={CircleAlert}
                  title={t("unverified")}
                  items={review.unverified}
                  empty=""
                  tone="warning"
                />
              </div>
            )}
            <NoteList
              icon={Sparkles}
              title={t("changes")}
              items={review.changes}
              empty={t("noChanges")}
            />
            <NoteList
              icon={ListChecks}
              title={t("emphasized")}
              items={review.emphasized}
              empty={t("noEmphasized")}
            />
            <NoteList
              icon={Target}
              title={t("gaps")}
              items={review.gaps}
              empty={t("noGaps")}
            />
            <NoteList
              icon={CircleAlert}
              title={t("flags")}
              items={review.flags}
              empty={t("noFlags")}
              tone="warning"
            />
          </div>
        </section>

        {masterText && (
          <details className="mt-6 rounded-2xl border border-border p-4 glass-panel">
            <summary className="min-h-11 cursor-pointer content-center font-bold">
              {t("compare")}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("compareHint")}
            </p>
            <pre className="mt-3 max-h-[28rem] overflow-auto rounded-xl bg-card p-3 font-sans text-sm whitespace-pre-wrap">
              {masterText}
            </pre>
          </details>
        )}

        <section aria-labelledby="editor-heading" className="mt-8">
          <h2 id="editor-heading" className="sr-only">
            {t("editorHeading")}
          </h2>
          <ResumeEditor
            id={tailored.id}
            jobId={tailored.jobId}
            status={tailored.status}
            initial={tailored.resume}
          />
        </section>
      </main>
    </>
  );
}
