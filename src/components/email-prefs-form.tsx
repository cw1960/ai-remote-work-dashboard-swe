"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { PrefsResult } from "@/lib/email/actions";
import {
  EMAIL_PREFS,
  type EmailPref,
  type EmailPrefs,
} from "@/lib/email/prefs";

/**
 * On/off switches for each email type. Every change saves at once; a
 * failed save puts the switch back and says so.
 */
export function EmailPrefsForm({
  initial,
  save,
}: {
  initial: EmailPrefs;
  save: (prefs: EmailPrefs) => Promise<PrefsResult>;
}) {
  const t = useTranslations("EmailSettings");
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function apply(next: EmailPrefs) {
    const before = prefs;
    setPrefs(next);
    startTransition(async () => {
      const result = await save(next).catch(() => ({ ok: false }) as const);
      if (result.ok) {
        setStatus("saved");
      } else {
        setPrefs(before);
        setStatus("error");
      }
    });
  }

  const allOff = EMAIL_PREFS.every((pref) => !prefs[pref]);

  return (
    <div className="grid gap-2">
      <ul className="grid gap-2">
        {EMAIL_PREFS.map((pref: EmailPref) => (
          <li
            key={pref}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/60 px-4 py-3"
          >
            <label
              htmlFor={`pref-${pref}`}
              className="grid cursor-pointer gap-0.5"
            >
              <span className="font-semibold">{t(`${pref}.label`)}</span>
              <span className="text-sm text-muted-foreground">
                {t(`${pref}.hint`)}
              </span>
            </label>
            <Switch
              id={`pref-${pref}`}
              checked={prefs[pref]}
              onCheckedChange={(checked) => {
                apply({ ...prefs, [pref]: checked });
              }}
            />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="editorialOutline"
          size="touch"
          disabled={allOff || pending}
          onClick={() => {
            apply({ alerts_on: false, reminders_on: false, recap_on: false });
          }}
        >
          {t("allOff")}
        </Button>
        <p
          role={status === "error" ? "alert" : "status"}
          className={
            status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {status === "saved" && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-4" aria-hidden="true" />
              {t("saved")}
            </span>
          )}
          {status === "error" && t("failed")}
        </p>
      </div>
    </div>
  );
}
