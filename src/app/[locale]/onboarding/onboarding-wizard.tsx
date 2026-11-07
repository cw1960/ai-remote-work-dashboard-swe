"use client";

import {
  ArrowLeft,
  Check,
  CircleAlert,
  Globe2,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Domain } from "@/lib/jobs/filters";
import { finishOnboarding, saveOnboardingStep } from "@/lib/profile/actions";
import type { OnboardingData } from "@/lib/profile/queries";
import {
  HOURS_OPTIONS,
  MEMBERSHIP_STATUSES,
  type MembershipStatus,
  type OnboardingStep,
  parseSkills,
  STEP_ORDER,
} from "@/lib/profile/schema";
import { cn } from "@/lib/utils";

export interface WizardOptions {
  domains: readonly Domain[];
  languages: { code: string; name: string }[];
  countries: { code: string; name: string }[];
}

/**
 * The 5-step onboarding. Each Continue saves that step on the server; Skip
 * moves on without saving. The last step marks onboarding as done.
 */
export function OnboardingWizard({
  data,
  options,
  doneHref,
}: {
  data: OnboardingData;
  options: WizardOptions;
  doneHref: string;
}) {
  const t = useTranslations("Onboarding");
  const tDomains = useTranslations("Domains");
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [domains, setDomains] = useState<string[]>(data.profile.domains);
  const [skills, setSkills] = useState(data.profile.skills.join(", "));
  const [languages, setLanguages] = useState<string[]>(data.profile.languages);
  const [languageQuery, setLanguageQuery] = useState("");
  const [country, setCountry] = useState(data.profile.country ?? "");
  const [hours, setHours] = useState<number>(data.profile.hoursPerWeek ?? 20);
  const [rate, setRate] = useState(
    data.profile.targetRate === null ? "" : String(data.profile.targetRate),
  );
  const [statuses, setStatuses] = useState<Record<string, MembershipStatus>>(
    data.statuses,
  );

  const step = STEP_ORDER[index] ?? "expertise";
  const last = index === STEP_ORDER.length - 1;

  const languageName = useMemo(
    () => new Map(options.languages.map((l) => [l.code, l.name])),
    [options.languages],
  );
  const countryName = options.countries.find((c) => c.code === country)?.name;

  function payload(): OnboardingStep | string {
    switch (step) {
      case "expertise":
        return {
          step,
          domains: domains as Domain[],
          skills: parseSkills(skills),
        };
      case "languages":
        return { step, languages };
      case "location":
        return country ? { step, country } : t("countryRequired");
      case "availability": {
        const value = rate.trim() === "" ? null : Number(rate);
        if (value !== null && !(value >= 1 && value <= 10_000)) {
          return t("rateInvalid");
        }
        return { step, hoursPerWeek: hours, targetRate: value };
      }
      case "platforms":
        return { step, statuses };
    }
  }

  function advance() {
    setError(null);
    if (!last) {
      setIndex(index + 1);
      return;
    }
    startTransition(async () => {
      const result = await finishOnboarding();
      if (result.ok) setDone(true);
      else setError(t("saveFailedBody"));
    });
  }

  function continueStep() {
    const body = payload();
    if (typeof body === "string") {
      setError(body);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveOnboardingStep(body);
      if (!result.ok) {
        setError(t("saveFailedBody"));
        return;
      }
      setSkipped((current) => current.filter((i) => i !== index));
      advance();
    });
  }

  function skipStep() {
    setSkipped((current) =>
      current.includes(index) ? current : [...current, index],
    );
    advance();
  }

  if (done) {
    return (
      <section
        aria-labelledby="done-title"
        className="mx-auto mt-10 w-full max-w-lg step-enter rounded-3xl border border-border px-6 py-10 text-center glass-panel sm:px-10"
      >
        <span className="mx-auto grid size-16 place-items-center rounded-2xl text-primary-foreground gradient-primary">
          <Sparkles className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-bold text-primary uppercase">
          {t("doneEyebrow")}
        </p>
        <h1 id="done-title" className="mt-2 text-4xl font-extrabold">
          {t("doneTitle")}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-muted-foreground">
          {t("doneBody")}
        </p>
        {skipped.length > 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4 text-left">
            <p className="font-semibold">
              {t("doneSkipped", { count: skipped.length })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("doneSkippedBody")}
            </p>
          </div>
        )}
        <Button asChild variant="editorial" size="touch" className="mt-8">
          <Link href={doneHref}>
            {doneHref === "/dashboard" ? t("doneDashboard") : t("doneContinue")}
          </Link>
        </Button>
      </section>
    );
  }

  const filteredLanguages = options.languages.filter((l) =>
    l.name.toLowerCase().includes(languageQuery.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="pt-2">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="font-bold text-primary uppercase">
            {t("stepOf", { step: index + 1, total: STEP_ORDER.length })}
          </span>
          <span className="font-medium text-muted-foreground">
            {t(`stepNames.${step}`)}
          </span>
        </div>
        <div
          className="mt-3 flex gap-1.5"
          role="progressbar"
          aria-label={t("progress")}
          aria-valuemin={1}
          aria-valuemax={STEP_ORDER.length}
          aria-valuenow={index + 1}
        >
          {STEP_ORDER.map((name, i) => (
            <span
              key={name}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i <= index ? "bg-primary/70" : "bg-foreground/10",
              )}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_18rem]">
        <section key={step} className="step-enter pt-7 pb-36 md:pb-10">
          {pending ? (
            <StepSkeleton />
          ) : (
            <>
              {step === "expertise" && (
                <>
                  <StepHeading
                    title={t("expertiseTitle")}
                    copy={t("expertiseCopy")}
                  />
                  <div className="mt-6 flex flex-wrap gap-2">
                    {options.domains.map((domain) => {
                      const selected = domains.includes(domain);
                      return (
                        <Button
                          key={domain}
                          type="button"
                          size="touch"
                          variant={
                            selected ? "editorialSelected" : "editorialOutline"
                          }
                          aria-pressed={selected}
                          onClick={() => {
                            setDomains(
                              selected
                                ? domains.filter((d) => d !== domain)
                                : [...domains, domain],
                            );
                          }}
                        >
                          {selected && <Check aria-hidden="true" />}
                          {tDomains(domain)}
                        </Button>
                      );
                    })}
                  </div>
                  <label className="mt-7 block text-sm font-semibold">
                    {t("skills")}
                    <Input
                      value={skills}
                      onChange={(event) => {
                        setSkills(event.target.value.slice(0, 600));
                      }}
                      aria-describedby="skills-hint"
                      className="mt-2 h-12 rounded-xl bg-card/70 text-base"
                    />
                  </label>
                  <p
                    id="skills-hint"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    {t("skillsHint")}
                  </p>
                </>
              )}

              {step === "languages" && (
                <>
                  <StepHeading
                    title={t("languagesTitle")}
                    copy={t("languagesCopy")}
                  />
                  <label className="relative mt-6 block">
                    <span className="sr-only">{t("searchLanguages")}</span>
                    <Search
                      className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      value={languageQuery}
                      onChange={(event) => {
                        setLanguageQuery(event.target.value.slice(0, 40));
                      }}
                      placeholder={t("searchLanguages")}
                      className="h-12 rounded-xl bg-card/70 pl-11 text-base"
                    />
                  </label>
                  {languages.length > 0 && (
                    <p className="mt-3 text-sm">
                      {languages
                        .map((code) => languageName.get(code) ?? code)
                        .join(", ")}
                    </p>
                  )}
                  {filteredLanguages.length === 0 ? (
                    <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm">
                      {t("noLanguages", { query: languageQuery })}
                    </p>
                  ) : (
                    <div className="mt-4 flex max-h-96 flex-wrap gap-2 overflow-y-auto p-0.5">
                      {filteredLanguages.map((language) => {
                        const selected = languages.includes(language.code);
                        return (
                          <Button
                            key={language.code}
                            type="button"
                            size="touch"
                            variant={
                              selected
                                ? "editorialSelected"
                                : "editorialOutline"
                            }
                            aria-pressed={selected}
                            onClick={() => {
                              setLanguages(
                                selected
                                  ? languages.filter((l) => l !== language.code)
                                  : [...languages, language.code],
                              );
                            }}
                          >
                            {selected && <Check aria-hidden="true" />}
                            {language.name}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {step === "location" && (
                <>
                  <StepHeading
                    title={t("locationTitle")}
                    copy={t("locationCopy")}
                  />
                  <label className="mt-7 block text-sm font-semibold">
                    {t("country")}
                    <select
                      value={country}
                      onChange={(event) => {
                        setCountry(event.target.value);
                      }}
                      className="mt-2 h-12 w-full rounded-xl border border-input bg-card px-3 text-base"
                    >
                      <option value="" className="bg-popover">
                        {t("chooseCountry")}
                      </option>
                      {options.countries.map((c) => (
                        <option
                          key={c.code}
                          value={c.code}
                          className="bg-popover"
                        >
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-5 flex gap-3 rounded-2xl border border-border bg-card/60 p-4 text-sm">
                    <Globe2
                      className="size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {t("countryNote")}
                  </p>
                </>
              )}

              {step === "availability" && (
                <>
                  <StepHeading
                    title={t("availabilityTitle")}
                    copy={t("availabilityCopy")}
                  />
                  <fieldset className="mt-7">
                    <legend className="text-sm font-semibold">
                      {t("hoursPerWeek")}
                    </legend>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {HOURS_OPTIONS.map((value) => (
                        <Button
                          key={value}
                          type="button"
                          size="touch"
                          variant={
                            hours === value
                              ? "editorialSelected"
                              : "editorialOutline"
                          }
                          aria-pressed={hours === value}
                          onClick={() => {
                            setHours(value);
                          }}
                        >
                          {value}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="mt-7 block text-sm font-semibold">
                    {t("targetRate")}
                    <span className="relative mt-2 block">
                      <span
                        className="absolute top-1/2 left-4 -translate-y-1/2 font-semibold text-muted-foreground"
                        aria-hidden="true"
                      >
                        $
                      </span>
                      <Input
                        inputMode="decimal"
                        value={rate}
                        onChange={(event) => {
                          setRate(
                            event.target.value
                              .replace(/[^0-9.]/g, "")
                              .slice(0, 8),
                          );
                        }}
                        className="h-12 rounded-xl bg-card/70 pr-14 pl-8 text-base"
                      />
                      <span
                        className="absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground"
                        aria-hidden="true"
                      >
                        USD
                      </span>
                    </span>
                  </label>
                </>
              )}

              {step === "platforms" && (
                <>
                  <StepHeading
                    title={t("platformsTitle")}
                    copy={t("platformsCopy")}
                  />
                  {data.platforms.length === 0 ? (
                    <p className="mt-6 text-sm text-muted-foreground">
                      {t("noPlatforms")}
                    </p>
                  ) : (
                    <ul className="mt-6 grid gap-2.5">
                      {data.platforms.map((platform) => (
                        <li
                          key={platform.slug}
                          className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card/60 p-3"
                        >
                          <span
                            className="grid size-10 shrink-0 place-items-center rounded-xl font-bold text-primary-foreground gradient-primary"
                            aria-hidden="true"
                          >
                            {platform.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {platform.name}
                          </span>
                          <select
                            aria-label={t("statusFor", {
                              platform: platform.name,
                            })}
                            value={statuses[platform.slug] ?? "not_joined"}
                            onChange={(event) => {
                              setStatuses({
                                ...statuses,
                                [platform.slug]: event.target
                                  .value as MembershipStatus,
                              });
                            }}
                            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                          >
                            {MEMBERSHIP_STATUSES.map((status) => (
                              <option
                                key={status}
                                value={status}
                                className="bg-popover"
                              >
                                {t(`statuses.${status}`)}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}

          {error && !pending && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/35 bg-destructive/10 p-4"
            >
              <CircleAlert
                className="mt-0.5 size-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">{t("saveFailed")}</p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            </div>
          )}
        </section>

        <aside
          aria-label={t("summary")}
          className="mt-7 hidden self-start rounded-2xl border border-border p-6 glass-panel md:block"
        >
          <span className="grid size-12 place-items-center rounded-xl text-primary-foreground gradient-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-bold text-primary uppercase">
            {t("summary")}
          </p>
          <h2 className="mt-2 text-xl font-extrabold">{t("summaryTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("summaryCopy")}
          </p>
          <dl className="mt-6 grid gap-4 text-sm">
            <Summary label={t("stepNames.expertise")}>
              {domains.map((d) => tDomains(d as Domain)).join(", ") ||
                t("notAnswered")}
            </Summary>
            <Summary label={t("stepNames.languages")}>
              {languages.map((c) => languageName.get(c) ?? c).join(", ") ||
                t("notAnswered")}
            </Summary>
            <Summary label={t("stepNames.location")}>
              {countryName ?? t("notAnswered")}
            </Summary>
            <Summary label={t("stepNames.availability")}>
              {t("targetValue", {
                hours,
                rate: rate.trim() === "" ? "none" : `$${rate}`,
              })}
            </Summary>
          </dl>
        </aside>
      </div>

      <div
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl md:static md:mt-2 md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Button
            type="button"
            variant="editorialOutline"
            size="touch"
            disabled={index === 0 || pending}
            onClick={() => {
              setError(null);
              setIndex(index - 1);
            }}
          >
            <ArrowLeft aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t("back")}</span>
          </Button>
          <Button
            type="button"
            variant="editorialLink"
            size="touch"
            disabled={pending}
            onClick={skipStep}
          >
            {t("skip")}
          </Button>
          <Button
            type="button"
            variant="editorial"
            size="touch"
            className="ml-auto min-w-36"
            disabled={pending}
            onClick={continueStep}
          >
            {pending ? (
              t("saving")
            ) : error ? (
              <>
                <RotateCcw aria-hidden="true" />
                {t("retry")}
              </>
            ) : last ? (
              t("finish")
            ) : (
              t("continue")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepHeading({ title, copy }: { title: string; copy: string }) {
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">{copy}</p>
    </>
  );
}

function Summary({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{children}</dd>
    </div>
  );
}

function StepSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <div className="mt-8 grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
