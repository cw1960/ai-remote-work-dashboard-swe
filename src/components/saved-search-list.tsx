"use client";

import { Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { deleteSearch, setSearchFrequency } from "@/lib/alerts/actions";
import { FREQUENCIES, type Frequency } from "@/lib/alerts/saved-search";

export interface SavedSearchItem {
  id: string;
  description: string;
  frequency: Frequency;
  /** The feed with this search's filters. */
  href: string;
}

/** Saved searches on the settings page: how often, see jobs, delete. */
export function SavedSearchList({ initial }: { initial: SavedSearchItem[] }) {
  const t = useTranslations("SavedSearches");
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState<{ text: string; error: boolean }>({
    text: "",
    error: false,
  });
  const [, startTransition] = useTransition();

  function changeFrequency(item: SavedSearchItem, frequency: Frequency) {
    const before = items;
    setItems(items.map((i) => (i.id === item.id ? { ...i, frequency } : i)));
    startTransition(async () => {
      const result = await setSearchFrequency({ id: item.id, frequency });
      if (result.ok) {
        setStatus({ text: t("updated"), error: false });
      } else {
        setItems(before);
        setStatus({ text: t("updateFailed"), error: true });
      }
    });
  }

  function remove(item: SavedSearchItem) {
    const before = items;
    setItems(items.filter((i) => i.id !== item.id));
    startTransition(async () => {
      const result = await deleteSearch({ id: item.id });
      if (result.ok) {
        setStatus({
          text: t("deleted", { search: item.description }),
          error: false,
        });
      } else {
        setItems(before);
        setStatus({ text: t("deleteFailed"), error: true });
      }
    });
  }

  return (
    <div>
      <p
        role={status.error ? "alert" : "status"}
        className={
          status.error
            ? "min-h-5 text-sm text-destructive"
            : "min-h-5 text-sm text-muted-foreground"
        }
      >
        {status.text}
      </p>
      {items.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="font-semibold">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
          <Button
            asChild
            variant="editorialOutline"
            size="touch"
            className="mt-4"
          >
            <Link href="/jobs">
              <Search aria-hidden="true" />
              {t("browseJobs")}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-2 grid gap-2" aria-label={t("listLabel")}>
          {items.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 rounded-xl border border-border bg-card/60 px-4 py-3"
            >
              <p className="font-semibold break-words">{item.description}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`frequency-${item.id}`}>
                  {t("frequencyFor", { search: item.description })}
                </label>
                <select
                  id={`frequency-${item.id}`}
                  value={item.frequency}
                  onChange={(event) => {
                    changeFrequency(item, event.target.value as Frequency);
                  }}
                  className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  {FREQUENCIES.map((value) => (
                    <option key={value} value={value}>
                      {t(`frequency.${value}`)}
                    </option>
                  ))}
                </select>
                <Button asChild variant="editorialOutline" size="touch">
                  <Link href={item.href}>{t("seeJobs")}</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("deleteSearch", { search: item.description })}
                  onClick={() => {
                    remove(item);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  <span aria-hidden="true">{t("delete")}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
