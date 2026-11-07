import {
  BadgeCheck,
  BookOpen,
  Check,
  CircleAlert,
  FlaskConical,
  Gift,
  Languages,
  LayoutDashboard,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { BuyButton } from "@/components/playbook/buy-button";
import { PlaybookCover } from "@/components/playbook/cover";
import { playbookConfig } from "@/config/playbook";
import { siteConfig } from "@/config/site";
import { formatPlaybookPrice } from "@/lib/playbook/price";
import { parsePlaybookRef } from "@/lib/playbook/promo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Playbook");
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    alternates: { canonical: playbookConfig.url },
    openGraph: {
      type: "book",
      url: playbookConfig.url,
      title: t("metaTitle"),
      description: t("metaDescription"),
      siteName: playbookConfig.title,
      images: [
        {
          url: `${playbookConfig.url}/playbook/cover.webp`,
          width: 1253,
          height: 2000,
          alt: t("hero.coverAlt"),
        },
      ],
    },
    twitter: { card: "summary_large_image" },
  };
}

const PAINS = [
  "silence",
  "assessment",
  "interview",
  "scams",
  "resume",
] as const;
const ADVANTAGES = [
  ["teachers", BookOpen],
  ["service", Users],
  ["bilingual", Languages],
  ["experts", BadgeCheck],
] as const;
const CHAPTERS = [
  "c1",
  "c2",
  "c3",
  "c4",
  "c5",
  "c6",
  "c7",
  "c8",
  "c9",
  "c10",
  "c11",
  "c12",
  "c13",
  "c14",
] as const;
const BONUSES = [
  ["vault", Gift],
  ["lab", FlaskConical],
  ["chapters", Sparkles],
  ["dashboard", LayoutDashboard],
] as const;
const FOR = ["switcher", "expert", "bilingual", "stuck"] as const;
const NOT_FOR = ["rich", "shortcuts"] as const;
const INCLUDES = [
  "book",
  "plan",
  "zara",
  "lab",
  "vault",
  "bonus",
  "dashboard",
] as const;
const FAQ = [
  "format",
  "experience",
  "guarantee",
  "platforms",
  "countries",
  "dashboard",
  "refund",
  "payment",
] as const;
const CHECKOUT_NOTICES = ["unavailable", "error", "cancelled"] as const;

/**
 * The Playbook's sales page, served at playbook.<domain>/ (and /playbook on
 * other hosts). Everything it says comes from the book itself.
 */
export default async function PlaybookPage({
  searchParams,
}: PageProps<"/[locale]/playbook">) {
  const [t, locale, query] = await Promise.all([
    getTranslations("Playbook"),
    getLocale(),
    searchParams,
  ]);
  const price = formatPlaybookPrice(locale);
  const notice = CHECKOUT_NOTICES.find((key) => key === query.checkout);
  const ref = parsePlaybookRef(query.ref);
  const days = playbookConfig.refundDays;

  const trust = (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <Zap className="size-4 text-primary" aria-hidden="true" />
        {t("trust.instant")}
      </li>
      <li className="flex items-center gap-1.5">
        <ShieldCheck className="size-4 text-success" aria-hidden="true" />
        {t("trust.guarantee", { days })}
      </li>
      <li className="flex items-center gap-1.5">
        <Lock className="size-4 text-primary" aria-hidden="true" />
        {t("trust.secure")}
      </li>
    </ul>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <span className="font-display text-sm font-extrabold sm:text-base">
            {t("brand")}
          </span>
          <BuyButton
            price={price}
            refTag={ref}
            short
            className="hidden sm:block"
          />
        </div>
      </header>

      <main id="main" className="flex-1 pb-24 sm:pb-0">
        {notice && (
          <div className="mx-auto max-w-6xl px-4 pt-4">
            <p
              role={notice === "cancelled" ? "status" : "alert"}
              className="flex gap-2 rounded-xl border border-primary/35 bg-primary/10 p-3 text-sm"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {t(`checkout.${notice}`)}
            </p>
          </div>
        )}

        {/* Hero */}
        <section
          aria-labelledby="hero-title"
          className="relative overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[1.25fr_1fr] lg:py-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary uppercase">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {t("hero.eyebrow")}
              </p>
              <h1
                id="hero-title"
                className="mt-4 font-display text-4xl leading-tight font-extrabold text-balance sm:text-5xl lg:text-6xl"
              >
                {t("hero.title")}
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
                {t("hero.lead")}
              </p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {(["chapters", "simulations", "plan"] as const).map((key) => (
                  <li
                    key={key}
                    className="rounded-full border border-border bg-card/60 px-3 py-1 text-sm font-semibold"
                  >
                    {t(`hero.facts.${key}`)}
                  </li>
                ))}
              </ul>
              <div className="mt-8 grid gap-4">
                <BuyButton price={price} refTag={ref} />
                {trust}
              </div>
            </div>
            <div className="mx-auto w-full max-w-[17rem] sm:max-w-xs lg:max-w-sm">
              <PlaybookCover
                label={t("hero.coverAlt")}
                className="rotate-[-2deg]"
                priority
              />
            </div>
          </div>
        </section>

        {/* Pain */}
        <section
          aria-labelledby="pain-title"
          className="mx-auto max-w-3xl px-4 py-12 sm:py-16"
        >
          <h2
            id="pain-title"
            className="font-display text-3xl font-extrabold sm:text-4xl"
          >
            {t("pain.title")}
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">{t("pain.lead")}</p>
          <ul className="mt-6 grid gap-3">
            {PAINS.map((key) => (
              <li
                key={key}
                className="flex gap-3 rounded-xl border border-border bg-card/60 p-4"
              >
                <X
                  className="mt-0.5 size-5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <span>{t(`pain.items.${key}`)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-lg font-semibold">{t("pain.close")}</p>
        </section>

        {/* Advantage */}
        <section
          aria-labelledby="advantage-title"
          className="mx-auto max-w-6xl px-4 py-12 sm:py-16"
        >
          <div className="max-w-3xl">
            <h2
              id="advantage-title"
              className="font-display text-3xl font-extrabold sm:text-4xl"
            >
              {t("advantage.title")}
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              {t("advantage.lead")}
            </p>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ADVANTAGES.map(([key, Icon]) => (
              <li
                key={key}
                className="rounded-2xl border border-border p-5 glass-panel"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-bold">
                  {t(`advantage.items.${key}.title`)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(`advantage.items.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Inside */}
        <section
          aria-labelledby="inside-title"
          className="mx-auto max-w-6xl px-4 py-12 sm:py-16"
        >
          <div className="max-w-3xl">
            <h2
              id="inside-title"
              className="font-display text-3xl font-extrabold sm:text-4xl"
            >
              {t("inside.title")}
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              {t("inside.lead", { pages: playbookConfig.pages })}
            </p>
          </div>
          <ol className="mt-8 grid gap-3 md:grid-cols-2">
            {CHAPTERS.map((key, index) => (
              <li
                key={key}
                className="flex gap-4 rounded-2xl border border-border bg-card/60 p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 font-bold text-primary">
                  {index + 1}
                </span>
                <span>
                  <span className="block font-bold">
                    {t(`inside.chapters.${key}.title`)}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {t(`inside.chapters.${key}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Sample */}
        <section
          aria-labelledby="sample-title"
          className="mx-auto max-w-3xl px-4 py-12 sm:py-16"
        >
          <h2
            id="sample-title"
            className="font-display text-3xl font-extrabold sm:text-4xl"
          >
            {t("sample.title")}
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            {t("sample.lead")}
          </p>
          <div className="mt-6 rounded-2xl border border-primary/30 p-5 glass-panel sm:p-6">
            <p className="text-xs font-bold text-primary uppercase">
              {t("sample.label")}
            </p>
            <dl className="mt-4 grid gap-4">
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">
                  {t("sample.promptLabel")}
                </dt>
                <dd className="mt-1 font-semibold">{t("sample.prompt")}</dd>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <dt className="text-sm font-semibold text-muted-foreground">
                  {t("sample.aLabel")}
                </dt>
                <dd className="mt-1">{t("sample.a")}</dd>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <dt className="text-sm font-semibold text-muted-foreground">
                  {t("sample.bLabel")}
                </dt>
                <dd className="mt-1">{t("sample.b")}</dd>
              </div>
            </dl>
            <p className="mt-5 font-bold">{t("sample.question")}</p>
            <details className="group mt-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border bg-card/60 px-4 font-semibold hover:bg-card">
                {t("sample.reveal")}
              </summary>
              <p className="mt-3 flex gap-2 rounded-xl border border-success/35 bg-success/10 p-3">
                <Check
                  className="mt-0.5 size-5 shrink-0 text-success"
                  aria-hidden="true"
                />
                {t("sample.judgment")}
              </p>
            </details>
          </div>
          <p className="mt-4 text-muted-foreground">{t("sample.close")}</p>
        </section>

        {/* Bonuses */}
        <section
          aria-labelledby="bonuses-title"
          className="mx-auto max-w-6xl px-4 py-12 sm:py-16"
        >
          <h2
            id="bonuses-title"
            className="font-display text-3xl font-extrabold sm:text-4xl"
          >
            {t("bonuses.title")}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BONUSES.map(([key, Icon]) => (
              <li
                key={key}
                className="rounded-2xl border border-border p-5 glass-panel"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-bold">
                  {t(`bonuses.items.${key}.title`)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(`bonuses.items.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Audience */}
        <section
          aria-label={t("audience.forTitle")}
          className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:py-16 md:grid-cols-2"
        >
          <div className="rounded-2xl border border-success/30 p-6 glass-panel">
            <h2 className="font-display text-2xl font-extrabold">
              {t("audience.forTitle")}
            </h2>
            <ul className="mt-4 grid gap-3">
              {FOR.map((key) => (
                <li key={key} className="flex gap-3">
                  <Check
                    className="mt-0.5 size-5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  {t(`audience.for.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border p-6 glass-panel">
            <h2 className="font-display text-2xl font-extrabold">
              {t("audience.notTitle")}
            </h2>
            <ul className="mt-4 grid gap-3">
              {NOT_FOR.map((key) => (
                <li key={key} className="flex gap-3">
                  <X
                    className="mt-0.5 size-5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  {t(`audience.not.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Author */}
        <section
          aria-labelledby="author-title"
          className="mx-auto max-w-3xl px-4 py-12 sm:py-16"
        >
          <h2
            id="author-title"
            className="font-display text-3xl font-extrabold sm:text-4xl"
          >
            {t("author.title")}
          </h2>
          <div className="mt-6 rounded-2xl border border-border p-6 glass-panel">
            <p className="font-display text-xl font-extrabold">
              {t("author.name")}
            </p>
            <blockquote className="mt-3 border-l-2 border-primary pl-4 text-lg italic">
              {t("author.body")}
            </blockquote>
            <p className="mt-4 text-muted-foreground">{t("author.more")}</p>
            <p className="mt-3 text-muted-foreground">{t("author.creator")}</p>
          </div>
        </section>

        {/* Offer */}
        <section
          id="buy"
          aria-labelledby="offer-title"
          className="mx-auto max-w-xl scroll-mt-20 px-4 py-12 sm:py-16"
        >
          <div className="relative overflow-hidden rounded-3xl border border-primary/40 p-6 text-center glass-panel sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl"
            />
            <div className="relative">
              <h2
                id="offer-title"
                className="font-display text-3xl font-extrabold"
              >
                {t("offer.title")}
              </h2>
              <p className="mt-2 text-muted-foreground">{t("offer.lead")}</p>
              <p className="mt-6 font-display text-6xl font-extrabold">
                {t("offer.price", { price })}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("offer.priceNote")}
              </p>
              <ul className="mx-auto mt-6 grid max-w-sm gap-2 text-left">
                {INCLUDES.map((key) => (
                  <li key={key} className="flex gap-2">
                    <Check
                      className="mt-0.5 size-5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    {t(`offer.includes.${key}`, {
                      pages: playbookConfig.pages,
                    })}
                  </li>
                ))}
              </ul>
              <div className="mt-8 grid justify-items-center gap-4">
                <BuyButton
                  price={price}
                  refTag={ref}
                  className="w-full sm:w-auto"
                />
                <div className="flex justify-center">{trust}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Guarantee */}
        <section
          aria-labelledby="guarantee-title"
          className="mx-auto max-w-3xl px-4 py-8"
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-success/30 bg-success/5 p-6 text-center sm:flex-row sm:text-left">
            <ShieldCheck
              className="size-14 shrink-0 text-success"
              aria-hidden="true"
            />
            <div>
              <h2
                id="guarantee-title"
                className="font-display text-2xl font-extrabold"
              >
                {t("guarantee.title", { days })}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {t("guarantee.body", { days })}
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby="faq-title"
          className="mx-auto max-w-3xl px-4 py-12 sm:py-16"
        >
          <h2
            id="faq-title"
            className="font-display text-3xl font-extrabold sm:text-4xl"
          >
            {t("faq.title")}
          </h2>
          <div className="mt-6 grid gap-3">
            {FAQ.map((key) => (
              <details
                key={key}
                className="group rounded-2xl border border-border bg-card/60 open:bg-card"
              >
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 p-4 font-bold">
                  {t(`faq.items.${key}.q`)}
                  <span
                    aria-hidden="true"
                    className="text-xl text-primary transition-transform group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-muted-foreground">
                  {t(`faq.items.${key}.a`, {
                    pages: playbookConfig.pages,
                    days,
                    email: siteConfig.supportEmail,
                  })}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Final call */}
        <section
          aria-labelledby="final-title"
          className="mx-auto max-w-3xl px-4 py-12 text-center sm:py-16"
        >
          <h2
            id="final-title"
            className="font-display text-3xl font-extrabold text-balance sm:text-4xl"
          >
            {t("final.title")}
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            {t("final.lead")}
          </p>
          <div className="mt-8 grid justify-items-center gap-4">
            <BuyButton
              price={price}
              refTag={ref}
              className="w-full sm:w-auto"
            />
            {trust}
          </div>
          <p className="mt-10 text-xs text-muted-foreground">
            {t("disclaimer")}
          </p>
        </section>
      </main>

      {/* Phones: the buy button stays in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 p-3 backdrop-blur sm:hidden">
        <BuyButton price={price} refTag={ref} short />
      </div>
    </>
  );
}
