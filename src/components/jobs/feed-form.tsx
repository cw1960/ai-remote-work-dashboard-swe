"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { type SubmitEvent, type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { FeedFilters } from "@/lib/jobs/filters";
import type { FilterOptions } from "@/lib/jobs/options";

import { FilterFields } from "./filter-fields";

/**
 * The feed's single GET form: search, sort and filters. Submitting navigates
 * to the same page with the filters in the URL (empty values dropped). With
 * JavaScript off it still works as a plain form.
 *
 * Filters render once per panel: always in the desktop sidebar, and in a
 * bottom sheet on phones. While the sheet is open the sidebar's fieldset is
 * disabled, so only the sheet's values are submitted.
 */
export function FeedForm({
  filters,
  options,
  activeCount,
  basePath,
  children,
}: {
  filters: FeedFilters;
  options: FilterOptions;
  activeCount: number;
  /** Where the feed lives: "/" (public) or "/jobs" (signed in). */
  basePath: "/" | "/jobs";
  children: ReactNode;
}) {
  const t = useTranslations("Feed");
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      // Leave out empty values and the default sort to keep URLs short.
      if (typeof value !== "string" || value.trim() === "") continue;
      if (key === "sort" && value === "newest") continue;
      params.append(key, value.trim());
    }
    setSheetOpen(false);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const clearAll = (
    <Button asChild variant="editorialLink" size="touch" className="px-2">
      <Link href={basePath}>{t("clearAll")}</Link>
    </Button>
  );

  return (
    <form
      ref={formRef}
      method="get"
      onSubmit={onSubmit}
      role="search"
      aria-label={t("searchLabel")}
    >
      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder={t("searchPlaceholder")}
              className="h-12 rounded-xl bg-card pl-11 text-base"
            />
          </label>
          <Button type="submit" variant="editorial" size="touch">
            {t("search")}
          </Button>
        </div>
        <div className="flex gap-2">
          <DialogPrimitive.Root open={sheetOpen} onOpenChange={setSheetOpen}>
            <DialogPrimitive.Trigger asChild>
              <Button
                type="button"
                variant="editorialOutline"
                size="touch"
                className="relative flex-1 md:hidden"
              >
                <SlidersHorizontal />
                {t("filters")}
                {activeCount > 0 && (
                  <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    <span aria-hidden="true">{activeCount}</span>
                    <span className="sr-only">
                      {t("filtersActive", { count: activeCount })}
                    </span>
                  </span>
                )}
              </Button>
            </DialogPrimitive.Trigger>
            {/* Not portalled: the fields must stay inside this <form>. */}
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 md:hidden" />
            <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-border bg-popover md:hidden">
              <div className="flex items-center justify-between gap-2 p-4">
                <div>
                  <DialogPrimitive.Title className="text-lg font-bold">
                    {t("filters")}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-sm text-muted-foreground">
                    {t("filtersActive", { count: activeCount })}
                  </DialogPrimitive.Description>
                </div>
                <div className="flex items-center gap-1">
                  {activeCount > 0 && clearAll}
                  <DialogPrimitive.Close asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={t("close")}
                    >
                      <X />
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              </div>
              <fieldset className="min-h-0 flex-1 overflow-y-auto px-4">
                <FilterFields filters={filters} options={options} />
              </fieldset>
              <div className="border-t border-border p-4">
                <Button
                  type="submit"
                  variant="editorial"
                  size="touch"
                  className="w-full"
                >
                  {t("apply")}
                </Button>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Root>

          <label className="flex flex-1 items-center gap-2 md:flex-none">
            <span className="sr-only text-sm text-muted-foreground md:not-sr-only">
              {t("sortLabel")}
            </span>
            <select
              name="sort"
              defaultValue={filters.sort}
              onChange={() => formRef.current?.requestSubmit()}
              className="h-11 flex-1 rounded-xl border border-border bg-card/60 px-3 text-sm font-medium"
            >
              <option value="newest" className="bg-popover">
                {t("sortNewest")}
              </option>
              <option value="pay" className="bg-popover">
                {t("sortPay")}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden md:block" aria-label={t("filters")}>
          <div className="sticky top-24 max-h-[calc(100dvh-15rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border p-5 glass-panel">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{t("filters")}</h2>
              {activeCount > 0 && clearAll}
            </div>
            <fieldset disabled={sheetOpen} className="mt-2">
              <FilterFields filters={filters} options={options} />
            </fieldset>
            <Button
              type="submit"
              variant="editorial"
              size="touch"
              className="mt-2 w-full"
            >
              {t("apply")}
            </Button>
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </form>
  );
}
