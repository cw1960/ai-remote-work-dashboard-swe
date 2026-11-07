/**
 * Card dates are calendar days. They are stored as timestamps at UTC
 * midnight and always shown in UTC, so a date reads the same everywhere.
 */

export const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" (a date input's value) for a stored timestamp. */
export function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

/** The stored timestamp for a date input's value; null when empty. */
export function fromDateInput(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

/** Today in the viewer's own time zone, as "YYYY-MM-DD". */
export function localToday(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The day `days` after a "YYYY-MM-DD" day. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The Monday after a "YYYY-MM-DD" day (a week later if it is a Monday). */
export function nextMonday(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, (8 - weekday) % 7 || 7);
}

/** A board tile's follow-up label, and whether that day is over. */
export function dueView(
  iso: string | null,
  locale: string,
  now: number,
): { dueLabel: string | null; overdue: boolean } {
  if (!iso) return { dueLabel: null, overdue: false };
  const due = Date.parse(iso);
  return {
    dueLabel: formatDay(iso, locale),
    overdue: due + DAY_MS <= now,
  };
}

/** A stored day as "3 Oct" (in the locale's own order). */
export function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(Date.parse(iso));
}
