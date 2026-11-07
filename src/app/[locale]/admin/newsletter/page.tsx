import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { StateBlock } from "@/components/state-block";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import {
  getNewsletterCost,
  getNewsletterRun,
  getNewsletterRuns,
} from "@/lib/admin/queries";
import { isAdmin } from "@/lib/listings/queries";
import { CHANNELS, type Channel } from "@/lib/newsletter/drafts";

import { AdminNav } from "../admin-nav";
import { CopyDraft } from "./copy-draft";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.newsletter");
  return { title: t("metaTitle"), robots: { index: false } };
}

const searchSchema = z.object({ run: z.uuid().optional().catch(undefined) });

// Cells wrap long errors so tables fit a phone without a sideways-scrolling
// region.
const cellClass =
  "border-b border-border px-3 py-2 text-left align-top wrap-anywhere";

const POST_STATUSES = [
  "draft",
  "scheduled",
  "posting",
  "posted",
  "failed",
  "skipped",
] as const;

function isPostStatus(value: string): value is (typeof POST_STATUSES)[number] {
  return (POST_STATUSES as readonly string[]).includes(value);
}

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

/** Admin: the newsletter workflow's runs, job picks, drafts and spend. */
export default async function AdminNewsletterPage({
  searchParams,
}: PageProps<"/[locale]/admin/newsletter">) {
  if (!(await isAdmin())) notFound();
  const raw = await searchParams;
  const { run: requested } = searchSchema.parse({
    run: typeof raw.run === "string" ? raw.run : undefined,
  });
  const [t, tChannels, locale, cost, runs] = await Promise.all([
    getTranslations("Admin.newsletter"),
    getTranslations("NewsletterChannels"),
    getLocale(),
    getNewsletterCost(),
    getNewsletterRuns(),
  ]);
  const selected = runs.find((run) => run.id === requested) ?? runs[0];
  const details = selected ? await getNewsletterRun(selected.id) : null;

  const usd = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  });
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const postTime = new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    timeZone: siteConfig.newsletter.timeZone,
  });
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const issueDate = (value: string) =>
    date.format(new Date(`${value}T00:00:00Z`));

  const tiles = [
    ["last7", cost.last_7d],
    ["last30", cost.last_30d],
    ["thisMonth", cost.this_month],
  ] as const;

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-2 mb-6 text-muted-foreground">
          {t("intro", { newsletter: siteConfig.newsletter.name })}
        </p>
        <AdminNav current="newsletter" />

        <section aria-labelledby="cost-heading">
          <h2 id="cost-heading" className="text-xl font-extrabold">
            {t("cost.heading")}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tiles.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-border p-4 glass-panel"
              >
                <dt className="text-sm text-muted-foreground">
                  {t(`cost.${key}`)}
                </dt>
                <dd className="mt-1 text-2xl font-extrabold">
                  {usd.format(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="runs-heading" className="mt-12">
          <h2 id="runs-heading" className="text-xl font-extrabold">
            {t("runs.heading")}
          </h2>
          {runs.length === 0 ? (
            <div className="mt-4">
              <StateBlock icon={Inbox} title={t("runs.empty")} />
            </div>
          ) : (
            <div className="mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={cellClass}>
                      {t("runs.issue")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("runs.kind")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("runs.status")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("runs.cost")}
                    </th>
                    <th scope="col" className={cellClass}>
                      {t("runs.output")}
                    </th>
                    <th scope="col" className={cellClass}>
                      <span className="sr-only">{t("runs.view")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <th scope="row" className={`${cellClass} font-semibold`}>
                        {issueDate(run.issue_date)}
                      </th>
                      <td className={cellClass}>
                        {run.kind === "daily" ||
                        run.kind === "weekly" ||
                        run.kind === "social"
                          ? t(`runs.kinds.${run.kind}`)
                          : run.kind}
                      </td>
                      <td className={cellClass}>
                        {run.status === "running" ||
                        run.status === "succeeded" ||
                        run.status === "failed"
                          ? t(`runs.statuses.${run.status}`)
                          : run.status}
                        {run.error && (
                          <span className="block text-xs text-destructive">
                            {run.error}
                          </span>
                        )}
                      </td>
                      <td className={cellClass}>{usd.format(run.cost_usd)}</td>
                      <td className={cellClass}>
                        {t("runs.outputValue", {
                          picks: run.shortlisted,
                          drafts: run.drafts,
                        })}
                      </td>
                      <td className={cellClass}>
                        <Link
                          href={`/admin/newsletter?run=${run.id}`}
                          aria-label={t("runs.viewLabel", {
                            date: issueDate(run.issue_date),
                          })}
                          aria-current={
                            run.id === selected?.id ? "page" : undefined
                          }
                          className="font-semibold underline underline-offset-4"
                        >
                          {t("runs.view")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && details && (
          <section aria-labelledby="run-heading" className="mt-12">
            <h2 id="run-heading" className="text-xl font-extrabold">
              {t("run.heading", { date: issueDate(selected.issue_date) })}
            </h2>

            <h3 className="mt-6 text-lg font-bold">{t("run.shortlist")}</h3>
            {details.shortlist.length === 0 ? (
              <p className="mt-2 text-sm">{t("run.shortlistEmpty")}</p>
            ) : (
              <ol className="mt-3 grid gap-3">
                {details.shortlist.map((pick) => (
                  <li
                    key={pick.job_id}
                    className="grid gap-1 rounded-2xl border border-border p-4 glass-panel"
                  >
                    <p className="font-bold">
                      <span className="text-muted-foreground">
                        {pick.rank}.{" "}
                      </span>
                      <a
                        href={pick.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-4 hover:underline"
                      >
                        {pick.title}
                      </a>{" "}
                      <span className="font-normal text-muted-foreground">
                        · {pick.platform}
                      </span>
                    </p>
                    <p className="text-sm">{pick.reason}</p>
                    {pick.caveats && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold">
                          {t("run.caveats")}
                        </span>{" "}
                        {pick.caveats}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <h3 className="mt-8 text-lg font-bold">{t("run.drafts")}</h3>
            {details.drafts.length === 0 ? (
              <p className="mt-2 text-sm">{t("run.draftsEmpty")}</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {details.drafts.map((draft) => {
                  const channel = isChannel(draft.channel)
                    ? tChannels(draft.channel)
                    : draft.channel;
                  const textId = `draft-${draft.id}`;
                  return (
                    <li
                      key={draft.id}
                      className="grid gap-3 rounded-2xl border border-border p-4 glass-panel"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="font-bold">{channel}</h4>
                        <span className="text-xs text-muted-foreground">
                          {isPostStatus(draft.status)
                            ? t(`run.statuses.${draft.status}`)
                            : draft.status}
                          {draft.scheduled_for &&
                            ` · ${t("run.postsAt", {
                              time: postTime.format(
                                new Date(draft.scheduled_for),
                              ),
                            })}`}
                          {" · "}
                          {draft.emailed_at
                            ? t("run.emailed", {
                                date: `${dateTime.format(new Date(draft.emailed_at))} UTC`,
                              })
                            : t("run.notEmailed")}
                        </span>
                      </div>
                      {draft.post_url && (
                        <a
                          href={draft.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold underline underline-offset-4"
                        >
                          {t("run.viewPost")}
                        </a>
                      )}
                      {draft.post_error && (
                        <p className="text-sm text-destructive">
                          {draft.post_error}
                        </p>
                      )}
                      {draft.title && (
                        <p className="font-semibold">{draft.title}</p>
                      )}
                      <p
                        id={textId}
                        className="text-sm wrap-anywhere whitespace-pre-wrap"
                      >
                        {draft.body}
                      </p>
                      <CopyDraft
                        text={draft.body}
                        channel={channel}
                        textId={textId}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}
