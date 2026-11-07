/**
 * A micro1 job's own page (jobs.micro1.ai/post/<id>), read for its full
 * description when a signed-in user opens the resume tailor. micro1's feed
 * has no description; robots.txt on jobs.micro1.ai allows every path.
 *
 * The page is a Next.js App Router page: its data arrives as React Server
 * Component chunks (`self.__next_f.push([1, "…"])`). The job object holds
 * `job_description` either inline or as a reference ("$16") to a text row
 * ("16:T<byte length in hex>,<text>") elsewhere in the stream.
 *
 * Pure TypeScript: runs in Deno (Edge Functions) and Node (Vitest).
 */
import { DESCRIPTION_MAX_LENGTH } from "./job.ts";
import { htmlToText } from "./text.ts";

/** The job page for a micro1 job id (the feed's `job_id`). */
export function micro1JobPageUrl(externalId: string): string {
  return `https://jobs.micro1.ai/post/${encodeURIComponent(externalId)}`;
}

/** Descriptions shorter than this are placeholders, not a description. */
const MIN_LENGTH = 50;

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const FIELD = /"job_description":("(?:[^"\\]|\\.)*")/;

/** The page's server component stream, decoded and joined. */
function serverStream(html: string): string {
  let stream = "";
  for (const match of html.matchAll(CHUNK)) {
    try {
      stream += JSON.parse(match[1] ?? '""') as string;
    } catch {
      // A chunk that isn't a valid string literal is skipped.
    }
  }
  return stream;
}

/** A text row ("<id>:T<hex byte length>,<text>") from the stream. */
function textRow(stream: string, id: string): string | null {
  const header = new RegExp(`(?:^|\\n|})${id}:T([0-9a-f]+),`).exec(stream);
  if (!header?.[1]) return null;
  const length = Number.parseInt(header[1], 16);
  const start = header.index + header[0].length;
  const bytes = new TextEncoder().encode(stream.slice(start));
  return new TextDecoder().decode(bytes.slice(0, length));
}

/** Readable text from micro1's description HTML (Quill markup). */
function toText(html: string): string {
  return htmlToText(
    html
      .replace(/<span class="ql-ui"[^>]*>\s*<\/span>/gi, "")
      .replace(/<li[^>]*>/gi, "<br>- ")
      .replace(/<\/li>/gi, "<br>"),
  ).replace(/\n\n(?=- )/g, "\n");
}

/**
 * The job's description as plain text, or null when the page has none (or
 * its layout changed). Capped at the stored maximum length.
 */
export function parseMicro1JobPage(html: string): string | null {
  const stream = serverStream(html);
  const field = FIELD.exec(stream);
  if (!field?.[1]) return null;

  let value: string;
  try {
    value = JSON.parse(field[1]) as string;
  } catch {
    return null;
  }
  // "$<hex>" points at a text row; "$$…" is a literal leading "$".
  const reference = /^\$([0-9a-f]+)$/.exec(value);
  const raw = reference?.[1]
    ? textRow(stream, reference[1])
    : value.startsWith("$$")
      ? value.slice(1)
      : value;
  if (!raw) return null;

  const text = toText(raw);
  if (text.length < MIN_LENGTH) return null;
  return text.slice(0, DESCRIPTION_MAX_LENGTH).trim();
}
