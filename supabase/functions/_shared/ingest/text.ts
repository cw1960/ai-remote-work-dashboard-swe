/** Text helpers shared by adapters. */

/** Collapses whitespace and trims; returns null for empty input. */
export function cleanText(text: string | null | undefined): string | null {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

/** Headings, lines that are all bold ("**About the role**"), and short
 * "Label: value" lines ("Location: Remote") are not summary material. */
function isLabelLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^\*\*[^*]+\*\*:?$/.test(trimmed) ||
    (trimmed.length < 60 && /^[\p{L} /&-]{1,30}:(\s|$)/u.test(trimmed))
  );
}

function plain(markdown: string): string | null {
  return cleanText(
    markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}(>|[-*+]|\d+\.)\s+/gm, "")
      .replace(/[*_`~#]+/g, ""),
  );
}

/** Paragraphs shorter than this are headings or fragments, not a summary. */
const MIN_SUMMARY_LENGTH = 40;

/**
 * A short plain-text summary from a (markdown) description: the first
 * sentence-length paragraph without formatting, cut at a sentence end or
 * word boundary. We store a summary only, never the full description.
 */
export function summarize(
  markdown: string | null | undefined,
  maxLength = 280,
): string | null {
  const paragraphs = (markdown ?? "")
    .split(/\n\s*\n/)
    .map((block) =>
      plain(
        block
          .split("\n")
          .filter((line) => !isLabelLine(line))
          .join("\n"),
      ),
    )
    .filter((block): block is string => block !== null);
  const firstParagraph =
    paragraphs.find((block) => block.length >= MIN_SUMMARY_LENGTH) ??
    paragraphs[0];
  if (!firstParagraph) return null;
  if (firstParagraph.length <= maxLength) return firstParagraph;

  const cut = firstParagraph.slice(0, maxLength);
  const sentenceEnd = cut.lastIndexOf(". ");
  if (sentenceEnd >= maxLength / 2) return cut.slice(0, sentenceEnd + 1);
  const wordEnd = cut.lastIndexOf(" ");
  return `${cut.slice(0, wordEnd > 0 ? wordEnd : maxLength - 1).trimEnd()}…`;
}

/**
 * Parses a source timestamp. Sources send UTC without an offset
 * ("2026-09-28T23:46:06" or "2026-09-28 19:40:05"); we read those as UTC.
 */
export function toIsoUtc(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(" ", "T");
  const withZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const time = Date.parse(withZone);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
};

/** Decodes named and numeric HTML entities. */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#")) {
        const point =
          code[1] === "x" || code[1] === "X"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : entity;
      }
      return ENTITIES[code.toLowerCase()] ?? entity;
    },
  );
}

/**
 * Plain text from an HTML description: blocks become paragraphs (blank
 * lines), list items become lines, tags and entities are removed.
 * Greenhouse escapes its HTML once more, so `&lt;p&gt;` is decoded first.
 */
export function htmlToText(html: string | null | undefined): string {
  const markup = /&lt;\/?[a-z]/i.test(html ?? "")
    ? decodeEntities(html ?? "")
    : (html ?? "");
  return decodeEntities(
    markup
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|ul|ol|li|section|table|tr)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The text after the first heading that matches one of `headings` (case
 * insensitive, the heading alone on its line), or the whole text when none
 * matches. Used to skip company boilerplate before the role description.
 */
export function sectionAfter(
  text: string,
  headings: readonly string[],
): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => {
    const label = line
      .trim()
      .replace(/[:：]$/, "")
      .toLowerCase();
    return headings.some((heading) => label === heading.toLowerCase());
  });
  return index === -1 ? text : lines.slice(index + 1).join("\n");
}

const AMOUNT = String.raw`\$\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)`;
const HOURLY = String.raw`(?:\s*(?:USD)?\s*(?:\/\s*(?:hour|hr)\b|per\s+hour\b|an\s+hour\b|hourly\b))`;
const RANGE = new RegExp(
  `${AMOUNT}${HOURLY}?\\s*(?:-|–|—|to|-to-)\\s*${AMOUNT}${HOURLY}`,
  "i",
);
const SINGLE = new RegExp(`${AMOUNT}${HOURLY}`, "i");

/**
 * Hourly USD pay stated in a description ("$22 per hour", "$35/hour -
 * $45/hour", "$6-to- $65 per hour"). Only amounts that are explicitly per
 * hour count; anything else (per task, salaries, bonuses) is left null.
 */
export function parseHourlyPay(text: string | null | undefined): {
  pay_min: number | null;
  pay_max: number | null;
  pay_unit: "hour" | null;
} {
  const none = { pay_min: null, pay_max: null, pay_unit: null };
  const source = (text ?? "").replace(/\s+/g, " ");
  const range = RANGE.exec(source);
  const values = range
    ? [range[1], range[2]]
    : [SINGLE.exec(source)?.[1]].filter((value) => value !== undefined);
  const amounts = values
    .map((value) => Number.parseFloat((value ?? "").replaceAll(",", "")))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1000);
  if (amounts.length === 0) return none;
  return {
    pay_min: Math.min(...amounts),
    pay_max: Math.max(...amounts),
    pay_unit: "hour",
  };
}
