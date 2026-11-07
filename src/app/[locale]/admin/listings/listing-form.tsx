"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  type SubmitEvent,
  useId,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveListing, type SaveListingResult } from "@/lib/listings/actions";
import type { AdminPlatform } from "@/lib/listings/queries";
import { PAY_UNITS } from "@/lib/listings/schema";
import { cn } from "@/lib/utils";

const FIELDS = [
  "platformName",
  "title",
  "url",
  "payMin",
  "payMax",
  "payUnit",
  "countries",
  "postedAt",
  "verifiedAt",
] as const;
type Field = (typeof FIELDS)[number];

function isField(value: string): value is Field {
  return (FIELDS as readonly string[]).includes(value);
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive md:text-sm";

/** One labelled control, with its hint and error tied to it. */
function Row({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Adds a hand-picked listing. The server checks it against stored jobs and
 * says what happened: saved, updated, held for review, or refused as a
 * duplicate.
 */
export function ListingForm({ platforms }: { platforms: AdminPlatform[] }) {
  const t = useTranslations("AdminListings");
  const id = useId();
  const [result, setResult] = useState<SaveListingResult | null>(null);
  const [pending, startTransition] = useTransition();

  const invalid = new Set<Field>(
    result && !result.ok ? (result.fields ?? []).filter(isField) : [],
  );
  const fieldId = (field: string) => `${id}-${field}`;
  const describedBy = (field: Field, hint = false) =>
    [
      hint ? `${fieldId(field)}-hint` : null,
      invalid.has(field) ? `${fieldId(field)}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const unknownCountries =
    result && !result.ok ? (result.unknownCountries ?? []) : [];
  const errorFor = (field: Field) => {
    if (!invalid.has(field)) return undefined;
    if (field === "countries" && unknownCountries.length > 0) {
      return t("fieldErrors.countriesUnknown", {
        names: unknownCountries.join(", "),
      });
    }
    return t(`fieldErrors.${field}`);
  };
  const text = (form: FormData, name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const input = {
      platformId: text(form, "platformId"),
      platformName: text(form, "platformName"),
      title: text(form, "title"),
      url: text(form, "url"),
      summary: text(form, "summary"),
      payMin: text(form, "payMin"),
      payMax: text(form, "payMax"),
      payUnit: text(form, "payUnit"),
      countries: text(form, "countries"),
      postedAt: text(form, "postedAt"),
      verifiedAt: text(form, "verifiedAt"),
    };
    startTransition(async () => {
      const next = await saveListing(input).catch(
        () => ({ ok: false, error: "failed" }) as const,
      );
      setResult(next);
      if (next.ok && next.outcome !== "duplicate") element.reset();
    });
  }

  function statusFor(current: SaveListingResult | null): string | null {
    if (!current) return null;
    if (!current.ok) return t(`errors.${current.error}`);
    if (current.outcome === "new") return t("outcome.new");
    return t(`outcome.${current.outcome}`, { match: current.match ?? "" });
  }
  const statusText = statusFor(result);
  const isError = result !== null && !result.ok;

  return (
    <form
      aria-labelledby={`${id}-heading`}
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4 rounded-2xl border border-border p-5 glass-panel"
    >
      <h2 id={`${id}-heading`} className="text-xl font-extrabold">
        {t("formTitle")}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Row id={fieldId("platformId")} label={t("company")}>
          <select
            id={fieldId("platformId")}
            name="platformId"
            defaultValue=""
            className={selectClass}
          >
            <option value="">{t("companyNone")}</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </Row>
        <Row
          id={fieldId("platformName")}
          label={t("companyNew")}
          hint={t("companyNewHint")}
          error={errorFor("platformName")}
        >
          <Input
            id={fieldId("platformName")}
            name="platformName"
            maxLength={100}
            autoComplete="off"
            aria-invalid={invalid.has("platformName") || undefined}
            aria-describedby={describedBy("platformName", true)}
          />
        </Row>
      </div>

      <Row
        id={fieldId("title")}
        label={t("jobTitle")}
        error={errorFor("title")}
      >
        <Input
          id={fieldId("title")}
          name="title"
          required
          maxLength={300}
          autoComplete="off"
          aria-invalid={invalid.has("title") || undefined}
          aria-describedby={describedBy("title")}
        />
      </Row>

      <Row
        id={fieldId("url")}
        label={t("url")}
        hint={t("urlHint")}
        error={errorFor("url")}
      >
        <Input
          id={fieldId("url")}
          name="url"
          type="url"
          inputMode="url"
          required
          maxLength={2000}
          placeholder="https://"
          aria-invalid={invalid.has("url") || undefined}
          aria-describedby={describedBy("url", true)}
        />
      </Row>

      <Row id={fieldId("summary")} label={t("summary")}>
        <Textarea
          id={fieldId("summary")}
          name="summary"
          maxLength={500}
          rows={3}
        />
      </Row>

      <div className="grid gap-4 sm:grid-cols-3">
        <Row
          id={fieldId("payMin")}
          label={t("payMin")}
          error={errorFor("payMin")}
        >
          <Input
            id={fieldId("payMin")}
            name="payMin"
            inputMode="decimal"
            aria-invalid={invalid.has("payMin") || undefined}
            aria-describedby={describedBy("payMin")}
          />
        </Row>
        <Row
          id={fieldId("payMax")}
          label={t("payMax")}
          error={errorFor("payMax")}
        >
          <Input
            id={fieldId("payMax")}
            name="payMax"
            inputMode="decimal"
            aria-invalid={invalid.has("payMax") || undefined}
            aria-describedby={describedBy("payMax")}
          />
        </Row>
        <Row
          id={fieldId("payUnit")}
          label={t("payUnit")}
          error={errorFor("payUnit")}
        >
          <select
            id={fieldId("payUnit")}
            name="payUnit"
            defaultValue=""
            className={selectClass}
            aria-invalid={invalid.has("payUnit") || undefined}
            aria-describedby={describedBy("payUnit")}
          >
            <option value="">{t("payUnitNone")}</option>
            {PAY_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`units.${unit}`)}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <Row
        id={fieldId("countries")}
        label={t("countries")}
        hint={t("countriesHint")}
        error={errorFor("countries")}
      >
        <Input
          id={fieldId("countries")}
          name="countries"
          autoComplete="off"
          aria-invalid={invalid.has("countries") || undefined}
          aria-describedby={describedBy("countries", true)}
        />
      </Row>

      <div className="grid gap-4 sm:grid-cols-2">
        <Row
          id={fieldId("postedAt")}
          label={t("postedAt")}
          error={errorFor("postedAt")}
        >
          <Input
            id={fieldId("postedAt")}
            name="postedAt"
            type="date"
            aria-invalid={invalid.has("postedAt") || undefined}
            aria-describedby={describedBy("postedAt")}
          />
        </Row>
        <Row
          id={fieldId("verifiedAt")}
          label={t("verifiedAt")}
          error={errorFor("verifiedAt")}
        >
          <Input
            id={fieldId("verifiedAt")}
            name="verifiedAt"
            type="date"
            aria-invalid={invalid.has("verifiedAt") || undefined}
            aria-describedby={describedBy("verifiedAt")}
          />
        </Row>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="editorial"
          size="touch"
          disabled={pending}
        >
          {pending ? t("saving") : t("save")}
        </Button>
        <p
          role={isError ? "alert" : "status"}
          className={cn(
            "flex items-center gap-1.5 text-sm",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {statusText && isError && (
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          )}
          {statusText && !isError && (
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          )}
          {statusText}
        </p>
      </div>
    </form>
  );
}
