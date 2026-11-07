"use client";

import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Check,
  FileText,
  KanbanSquare,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PlaybookCard } from "@/components/playbook/promo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { INTRO_COOKIE } from "@/lib/intro";

const TRUST = ["free", "noAccount", "noCard", "private"] as const;

const TAILOR_STEPS = ["upload", "click", "review"] as const;

const FEATURES = [
  ["resume", FileText],
  ["feed", Search],
  ["matches", Target],
  ["board", KanbanSquare],
  ["reminders", BellRing],
  ["passport", BadgeCheck],
] as const;

/**
 * The hero above the feed for signed-out visitors: what the site does, the
 * resume tailoring spotlight, and every feature, all free. Hiding it sets a
 * cookie so it stays hidden.
 */
export function IntroBand({
  openJobs,
  platforms,
}: {
  /** Open jobs in the feed, for the browse button. */
  openJobs: number;
  /** The platforms the feed covers, as a readable list. */
  platforms: string;
}) {
  const t = useTranslations("Intro");
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <section
      aria-labelledby="intro-title"
      className="relative mt-4 overflow-hidden rounded-3xl border border-border px-5 py-10 glass-panel sm:px-10 sm:py-14"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-primary/20 blur-3xl"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-3 right-3 z-10 size-11"
        aria-label={t("dismiss")}
        onClick={() => {
          document.cookie = `${INTRO_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
          setHidden(true);
        }}
      >
        <X aria-hidden="true" />
      </Button>

      <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary uppercase">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t("label")}
          </p>
          <h2
            id="intro-title"
            className="mt-4 pr-10 font-display text-4xl leading-tight font-extrabold text-balance sm:text-5xl lg:text-6xl"
          >
            {t("title")}
          </h2>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {t("lead", { platforms })}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              variant="editorial"
              size="touch"
              className="h-13 px-7 text-base"
            >
              <Link href="/sign-in">
                {t("signUp")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="editorialOutline"
              size="touch"
              className="h-13 px-7 text-base"
            >
              <a href="#feed">{t("browse", { count: openJobs })}</a>
            </Button>
            <Button
              asChild
              variant="editorialLink"
              size="touch"
              className="h-13 px-7 text-base"
            >
              <Link href="/how-it-works">{t("learnMore")}</Link>
            </Button>
          </div>
          <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            {TRUST.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <Check
                  className="size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                {t(`trust.${key}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-card/70 p-6 glass-panel">
          <p className="inline-flex rounded-full bg-foreground px-2.5 py-0.5 text-xs font-bold text-background uppercase">
            {t("spotlight.badge")}
          </p>
          <h3 className="mt-3 flex items-center gap-2 font-display text-2xl font-extrabold">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            {t("spotlight.title")}
          </h3>
          <p className="mt-2 text-muted-foreground">{t("spotlight.body")}</p>
          <ol className="mt-5 grid gap-3">
            {TAILOR_STEPS.map((key, index) => (
              <li key={key} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 font-bold text-primary">
                  {index + 1}
                </span>
                <span className="pt-1">{t(`spotlight.steps.${key}`)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex gap-2 rounded-xl border border-border bg-background/40 p-3 text-sm text-muted-foreground">
            <BadgeCheck
              className="mt-0.5 size-4 shrink-0 text-success"
              aria-hidden="true"
            />
            {t("spotlight.note")}
          </p>
        </div>
      </div>

      <h3 className="relative mt-14 font-display text-2xl font-extrabold sm:text-3xl">
        {t("featuresTitle")}
      </h3>
      <ul className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([key, Icon]) => (
          <li
            key={key}
            className="flex gap-4 rounded-2xl border border-border bg-card/60 p-5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="flex flex-wrap items-center gap-2 font-bold">
                {t(`features.${key}.title`)}
                {key === "resume" && (
                  <span className="rounded-full bg-foreground px-2 py-0.5 text-[0.65rem] font-bold text-background uppercase">
                    {t("spotlight.badge")}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t(`features.${key}.body`, { platforms })}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <PlaybookCard refTag="home" className="relative mt-8 max-w-2xl" />
      <p className="relative mt-8 max-w-3xl text-sm text-muted-foreground">
        {t("howFree")}
      </p>
    </section>
  );
}
