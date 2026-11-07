import {
  AlarmClock,
  ArrowRight,
  CalendarCheck,
  CircleCheck,
  ClipboardCheck,
  type LucideIcon,
  RotateCcw,
  SearchX,
  Sparkles,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { TodayItem } from "@/lib/today/items";
import { formatDay } from "@/lib/tracker/dates";
import { cn } from "@/lib/utils";

/** Dashboard zone: the ranked list of what needs the user today. */
export async function TodayPanel({ items }: { items: TodayItem[] }) {
  const [t, locale] = await Promise.all([
    getTranslations("Today"),
    getLocale(),
  ]);

  return (
    <section
      aria-labelledby="today-title"
      className="mt-8 rounded-2xl border border-border p-4 glass-panel sm:p-6"
    >
      <h2 id="today-title" className="text-2xl font-extrabold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      {items.length === 0 ? (
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
            <CircleCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-bold">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2" aria-labelledby="today-title">
          {items.map((item) => {
            const view = itemView(item, t, locale);
            return (
              <li
                key={view.key}
                className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3"
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    view.urgent
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  <view.icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{view.text}</p>
                  {view.note && (
                    <p className="text-sm text-muted-foreground">{view.note}</p>
                  )}
                </div>
                <Link
                  href={view.href}
                  aria-label={view.actionLabel}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-1 text-sm font-bold text-primary hover:underline"
                >
                  {view.action}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type Translate = Awaited<ReturnType<typeof getTranslations<"Today">>>;

function itemView(
  item: TodayItem,
  t: Translate,
  locale: string,
): {
  key: string;
  icon: LucideIcon;
  urgent: boolean;
  text: string;
  note: string | null;
  href: string;
  action: string;
  actionLabel: string;
} {
  const openCard = (cardId: string, title: string) => ({
    href: `/dashboard?card=${cardId}`,
    action: t("open"),
    actionLabel: t("openCard", { title }),
  });
  switch (item.kind) {
    case "overdue":
      return {
        key: `overdue-${item.cardId}`,
        icon: AlarmClock,
        urgent: true,
        text: t("overdue", { title: item.title }),
        note: t("overdueNote", { date: formatDay(item.due, locale) }),
        ...openCard(item.cardId, item.title),
      };
    case "dueToday":
      return {
        key: `due-${item.cardId}`,
        icon: CalendarCheck,
        urgent: false,
        text: t("dueToday", { title: item.title }),
        note: t("dueTodayNote"),
        ...openCard(item.cardId, item.title),
      };
    case "reapply":
      return {
        key: `reapply-${item.slug}`,
        icon: RotateCcw,
        urgent: false,
        text: t("reapply", { platform: item.platform }),
        note: t("reapplyNote"),
        href: `/platforms/${item.slug}`,
        action: t("reapplyAction"),
        actionLabel: t("reapply", { platform: item.platform }),
      };
    case "assessment":
      return {
        key: `assessment-${item.cardId}`,
        icon: ClipboardCheck,
        urgent: false,
        text: t("assessment", { title: item.title }),
        note: t("assessmentNote"),
        ...openCard(item.cardId, item.title),
      };
    case "closed":
      return {
        key: `closed-${item.cardId}`,
        icon: SearchX,
        urgent: false,
        text: t("closed", { title: item.title }),
        note: t("closedNote"),
        ...openCard(item.cardId, item.title),
      };
    case "newMatches":
      return {
        key: "new-matches",
        icon: Sparkles,
        urgent: false,
        text: t("newMatches", { count: item.count }),
        note: null,
        href: "/dashboard#matched-title",
        action: t("newMatchesAction"),
        actionLabel: t("newMatchesAction"),
      };
  }
}
