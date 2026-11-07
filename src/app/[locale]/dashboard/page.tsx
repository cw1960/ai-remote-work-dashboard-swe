import { Mail, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { PlaybookCard } from "@/components/playbook/promo";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { formatPayAmount } from "@/lib/jobs/format";
import {
  countNewMatches,
  getMatchedJobs,
  profileCanMatch,
} from "@/lib/matching/queries";
import { getEmailsToReview } from "@/lib/inbound/queries";
import { getPassport, type PassportEntry } from "@/lib/passport/queries";
import { PLAYBOOK_CARD_COOKIE } from "@/lib/playbook/promo";
import { needsOnboarding } from "@/lib/profile/queries";
import { buildTodayItems, type TodayItem } from "@/lib/today/items";
import { recordDashboardVisit } from "@/lib/today/queries";
import { dueView } from "@/lib/tracker/dates";
import {
  type BoardCard,
  getBoard,
  getStageHistory,
} from "@/lib/tracker/queries";
import {
  computeStats,
  type PipelineStats as Stats,
  type StatsEvent,
} from "@/lib/tracker/stats";

import { Board, type BoardCardView } from "./board";
import { EmailReview } from "./email-review";
import { MatchedJobs } from "./matched-jobs";
import { PipelineStats } from "./pipeline-stats";
import { PlatformPassport } from "./platform-passport";
import { TodayPanel } from "./today-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * The signed-in user's dashboard: Today panel, Platform Passport, matched
 * jobs and the pipeline board.
 */
export default async function DashboardPage({
  searchParams,
}: PageProps<"/[locale]/dashboard">) {
  const [locale, user, params] = await Promise.all([
    getLocale(),
    getSessionUser(),
    searchParams,
  ]);
  if (!user) {
    redirect({ href: "/sign-in?next=%2Fdashboard", locale });
    return null;
  }

  const [
    t,
    tJob,
    cards,
    onboarding,
    matches,
    canMatch,
    passport,
    lastVisit,
    history,
    toReview,
  ] = await Promise.all([
    getTranslations("Dashboard"),
    getTranslations("Job"),
    getBoard(),
    needsOnboarding(user.id),
    getMatchedJobs(6),
    profileCanMatch(),
    getPassport(),
    recordDashboardVisit(),
    getStageHistory(),
    getEmailsToReview(),
  ]);
  const {
    items: todayItems,
    day,
    stats,
  } = await timeViews(cards ?? [], passport, lastVisit, history);
  const openCard = z.uuid().safeParse(params.card);
  const views = boardViews(cards ?? [], locale, (amount, unit) =>
    tJob("pay", { amount, unit }),
  );
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date());

  // Hidden for good once dismissed (a cookie, listed in the Cookie Notice).
  const showPlaybook = !(await cookies()).has(PLAYBOOK_CARD_COOKIE);

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main
        id="main"
        className="mx-auto w-full max-w-[1600px] flex-1 px-4 pt-7 pb-16 sm:px-6 lg:px-8"
      >
        <p className="text-xs font-bold text-primary uppercase">{today}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">
          {t("title")}
        </h1>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-muted-foreground">{t("subtitle")}</p>
          <Button asChild variant="editorialLink" size="touch" className="px-0">
            <Link href="/settings">
              <Mail aria-hidden="true" />
              {t("emailSettings")}
            </Link>
          </Button>
        </div>

        {/* Without a field or language, Matched jobs asks for them instead. */}
        {onboarding && canMatch && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/10 p-5">
            <div className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-bold">{t("completeProfile")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("completeProfileBody")}
                </p>
              </div>
            </div>
            <Button asChild variant="editorial" size="touch">
              <Link href="/onboarding?next=%2Fdashboard">
                {t("completeProfile")}
              </Link>
            </Button>
          </div>
        )}

        <TodayPanel items={todayItems} />

        {toReview.length > 0 && (
          <EmailReview
            emails={toReview}
            cards={views.map((card) => ({ id: card.id, title: card.title }))}
          />
        )}

        <PlatformPassport entries={passport} today={day} />

        <MatchedJobs matches={matches} canMatch={canMatch === true} />

        <Board
          initialCards={views}
          openCardId={openCard.success ? openCard.data : null}
          stats={views.length > 0 ? <PipelineStats stats={stats} /> : undefined}
        />

        {showPlaybook && (
          <PlaybookCard refTag="dashboard" dismissible className="mt-8" />
        )}

        <NewsletterSignup
          source="dashboard"
          defaultEmail={user.email ?? undefined}
          className="mt-8 rounded-2xl border border-border p-5 glass-panel"
        />
      </main>
    </>
  );
}

/**
 * What depends on the time: the Today panel's items, today (UTC) as
 * "YYYY-MM-DD" and the Pipeline's stats.
 */
async function timeViews(
  cards: BoardCard[],
  passport: PassportEntry[],
  lastVisit: string | null,
  history: StatsEvent[],
): Promise<{ items: TodayItem[]; day: string; stats: Stats }> {
  const now = Date.now();
  const newMatches = lastVisit ? await countNewMatches(lastVisit) : 0;
  return {
    items: buildTodayItems({ cards, passport, newMatches, now }),
    day: new Date(now).toISOString().slice(0, 10),
    stats: computeStats(cards, history, now),
  };
}

/**
 * Labels computed on the server so server and browser render the same text:
 * pay, the follow-up date and whether it is overdue.
 */
function boardViews(
  cards: BoardCard[],
  locale: string,
  payLabel: (amount: string, unit: string) => string,
): BoardCardView[] {
  const now = Date.now();
  return cards.map((card) => {
    const amount = card.job
      ? formatPayAmount(card.job.payMin, card.job.payMax, locale)
      : null;
    return {
      ...card,
      payLabel:
        amount && card.job
          ? payLabel(amount, card.job.payUnit ?? "other")
          : null,
      ...dueView(card.nextActionAt, locale, now),
    };
  });
}
