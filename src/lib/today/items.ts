import type { PassportEntry } from "@/lib/passport/queries";
import { DAY_MS } from "@/lib/tracker/dates";
import type { BoardCard } from "@/lib/tracker/queries";

/** One thing to do today, most urgent kinds first (see buildTodayItems). */
export type TodayItem =
  | { kind: "overdue"; cardId: string; title: string; due: string }
  | { kind: "dueToday"; cardId: string; title: string }
  | { kind: "reapply"; slug: string; platform: string }
  | { kind: "assessment"; cardId: string; title: string }
  | { kind: "closed"; cardId: string; title: string }
  | { kind: "newMatches"; count: number };

/**
 * The Today panel's ranked action list. Rules only:
 * overdue follow-ups, follow-ups due today, platforms the user may reapply
 * to, assessments in progress, tracked jobs that closed before the user
 * got far (Saved or Applied), then new matches since the last visit.
 */
export function buildTodayItems({
  cards,
  passport,
  newMatches,
  now,
}: {
  cards: readonly BoardCard[];
  passport: readonly PassportEntry[];
  newMatches: number;
  now: number;
}): TodayItem[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const byDue = [...cards]
    .filter((card) => card.nextActionAt !== null)
    .sort(
      (a, b) =>
        Date.parse(a.nextActionAt ?? "") - Date.parse(b.nextActionAt ?? ""),
    );

  const items: TodayItem[] = [];
  for (const card of byDue) {
    const due = Date.parse(card.nextActionAt ?? "");
    if (due + DAY_MS <= now) {
      items.push({
        kind: "overdue",
        cardId: card.id,
        title: card.title,
        due: card.nextActionAt ?? "",
      });
    }
  }
  for (const card of byDue) {
    const due = Date.parse(card.nextActionAt ?? "");
    if (due <= now && now < due + DAY_MS) {
      items.push({ kind: "dueToday", cardId: card.id, title: card.title });
    }
  }
  for (const entry of passport) {
    if (
      entry.status === "rejected" &&
      entry.reapplyAfter !== null &&
      entry.reapplyAfter <= today
    ) {
      items.push({ kind: "reapply", slug: entry.slug, platform: entry.name });
    }
  }
  for (const card of cards) {
    if (card.stage === "assessment") {
      items.push({ kind: "assessment", cardId: card.id, title: card.title });
    }
  }
  for (const card of cards) {
    if (
      card.job?.closed === true &&
      (card.stage === "saved" || card.stage === "applied")
    ) {
      items.push({ kind: "closed", cardId: card.id, title: card.title });
    }
  }
  if (newMatches > 0) items.push({ kind: "newMatches", count: newMatches });
  return items;
}
