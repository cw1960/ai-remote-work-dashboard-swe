/** Display helpers for job listings. Pure, so they run on server and client. */

/** Pay in USD, e.g. "$40–120" or "$60"; null when no pay is listed. */
export function formatPayAmount(
  min: number | null,
  max: number | null,
  locale: string,
): string | null {
  const values = [min, max].filter((v): v is number => v !== null && v > 0);
  if (values.length === 0) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const currency = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: low % 1 === 0 && high % 1 === 0 ? 0 : 2,
  });
  if (low === high) return currency.format(low);
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: high % 1 === 0 ? 0 : 2,
  });
  return `${currency.format(low)}–${number.format(high)}`;
}

/** "3 days ago", "yesterday", "2 months ago"… in the given locale. */
export function formatPostedAgo(
  postedAt: string,
  locale: string,
  now = new Date(),
): string {
  const seconds = (new Date(postedAt).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return rtf.format(0, "minute");
}

/** Localized country name for an ISO 3166-1 alpha-2 code. */
export function countryName(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
}

/** Localized language name for an ISO 639-1 code. */
export function languageName(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
}
