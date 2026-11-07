"use client";

import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Link } from "@/i18n/navigation";
import { updatePassport } from "@/lib/passport/actions";
import type { PassportEntry } from "@/lib/passport/queries";
import {
  MEMBERSHIP_STATUSES,
  type MembershipStatus,
} from "@/lib/profile/schema";
import { cn } from "@/lib/utils";

/**
 * Dashboard zone: the user's status on each listed platform, with the day
 * they may reapply after a rejection and a way in for platforms not joined.
 */
export function PlatformPassport({
  entries,
  today,
}: {
  entries: PassportEntry[];
  /** Today (UTC) as "YYYY-MM-DD", for "You can reapply now". */
  today: string;
}) {
  const t = useTranslations("Passport");

  return (
    <section aria-labelledby="passport-title" className="mt-10">
      <p className="text-xs font-bold text-primary uppercase">{t("eyebrow")}</p>
      <h2 id="passport-title" className="mt-1 text-2xl font-extrabold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      {entries.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul
          className="mt-5 grid gap-3 sm:grid-cols-2"
          aria-labelledby="passport-title"
        >
          {entries.map((entry) => (
            <li key={entry.slug}>
              <PassportTile entry={entry} today={today} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PassportTile({
  entry,
  today,
}: {
  entry: PassportEntry;
  today: string;
}) {
  const t = useTranslations("Passport");
  const tStatus = useTranslations("Onboarding.statuses");
  const [status, setStatus] = useState<MembershipStatus>(entry.status);
  const [reapplyAfter, setReapplyAfter] = useState(entry.reapplyAfter ?? "");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "failed"
  >("idle");
  const [, startTransition] = useTransition();

  function save(next: MembershipStatus, nextReapply: string) {
    setSaveState("saving");
    startTransition(async () => {
      const result = await updatePassport({
        platform: entry.slug,
        status: next,
        reapplyAfter: next === "rejected" ? nextReapply || null : null,
      });
      setSaveState(result.ok ? "saved" : "failed");
    });
  }

  const reapplyId = `reapply-${entry.slug}`;
  const canReapply =
    status === "rejected" && reapplyAfter !== "" && reapplyAfter <= today;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border p-4 glass-panel sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl font-bold text-primary-foreground gradient-primary"
          aria-hidden="true"
        >
          {entry.name.charAt(0).toUpperCase()}
        </span>
        <h3 className="min-w-0 flex-1 truncate font-bold">{entry.name}</h3>
        <select
          aria-label={t("statusFor", { platform: entry.name })}
          value={status}
          onChange={(event) => {
            const next = event.target.value as MembershipStatus;
            setStatus(next);
            save(next, reapplyAfter);
          }}
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
        >
          {MEMBERSHIP_STATUSES.map((option) => (
            <option key={option} value={option} className="bg-popover">
              {tStatus(option)}
            </option>
          ))}
        </select>
      </div>

      {status === "rejected" && (
        <div className="mt-4">
          <label htmlFor={reapplyId} className="text-sm font-semibold">
            {t("reapplyOn")}
          </label>
          <input
            id={reapplyId}
            type="date"
            value={reapplyAfter}
            onChange={(event) => {
              setReapplyAfter(event.target.value);
              save(status, event.target.value);
            }}
            className="mt-1.5 block h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          />
          {canReapply && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("reapplyNow")}
            </p>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        {status === "not_joined" || canReapply ? (
          <Link
            href={`/platforms/${entry.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-bold text-primary hover:underline"
          >
            {t("join", { platform: entry.name })}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href={`/jobs?platform=${entry.slug}`}
            className="inline-flex min-h-11 items-center rounded text-sm font-semibold hover:underline"
          >
            {t("openJobs", { count: entry.openJobs })}
          </Link>
        )}
        <span
          aria-live="polite"
          className={cn(
            "text-xs",
            saveState === "failed"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {saveState === "saving" && t("saving")}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5" aria-hidden="true" />
              {t("saved")}
            </span>
          )}
          {saveState === "failed" && t("failed")}
        </span>
      </div>
    </div>
  );
}
