"use client";

import { BellPlus, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SubmitEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { saveSearch } from "@/lib/alerts/actions";
import { FREQUENCIES, type Frequency } from "@/lib/alerts/saved-search";

/**
 * "Get alerts" for the current feed search: daily or weekly emails with
 * new matching jobs. Signed out, it leads to sign-in and back with
 * `?save=1`, which opens the dialog. Once saved, it links to the settings.
 */
export function SaveSearchButton({
  query,
  description,
  saved: initiallySaved,
  signInHref,
  autoOpen = false,
}: {
  /** The feed query string to save, e.g. "q=law&domain=law". */
  query: string;
  /** The search in words, shown in the dialog. */
  description: string;
  /** null when signed out. */
  saved: boolean | null;
  signInHref: string;
  autoOpen?: boolean;
}) {
  const t = useTranslations("SavedSearches");
  const [saved, setSaved] = useState(initiallySaved === true);
  // Back from sign-in with ?save=1: reopen what the visitor started.
  const [open, setOpen] = useState(autoOpen && initiallySaved === false);
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [error, setError] = useState<"limit" | "failed" | null>(null);
  const [pending, startTransition] = useTransition();

  if (initiallySaved === null) {
    return (
      <Button asChild variant="editorial" size="touch">
        <Link href={signInHref}>
          <BellPlus aria-hidden="true" />
          {t("getAlerts")}
        </Link>
      </Button>
    );
  }

  if (saved) {
    return (
      <Button asChild variant="editorialSelected" size="touch">
        <Link href="/settings" aria-label={t("alertsOnLabel")}>
          <BellRing aria-hidden="true" />
          {t("alertsOn")}
        </Link>
      </Button>
    );
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveSearch({ query, frequency });
      if (result.ok) {
        setSaved(true);
        setOpen(false);
      } else {
        setError(result.error === "limit" ? "limit" : "failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="editorial" size="touch">
          <BellPlus aria-hidden="true" />
          {t("getAlerts")}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-popover">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogBody")}</DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm font-semibold break-words">
            {description}
          </p>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-bold">{t("howOften")}</legend>
            {FREQUENCIES.map((value) => (
              <label
                key={value}
                htmlFor={`frequency-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/10"
              >
                <input
                  id={`frequency-${value}`}
                  type="radio"
                  name="frequency"
                  value={value}
                  checked={frequency === value}
                  onChange={() => {
                    setFrequency(value);
                  }}
                  className="size-4 accent-primary"
                />
                <span className="text-sm font-semibold">
                  {t(`frequency.${value}`)}
                </span>
                <span className="ml-auto text-right text-xs text-muted-foreground">
                  {t(`frequencyHint.${value}`)}
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error === "limit" ? t("limit") : t("saveFailed")}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="editorialOutline"
              size="touch"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant="editorial"
              size="touch"
              disabled={pending}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
