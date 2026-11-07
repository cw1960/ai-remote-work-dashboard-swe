import "server-only";

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import { LIMITS } from "../../../supabase/functions/_shared/resume/schema";

/** Largest upload accepted, in bytes (matches master_resumes.file_size). */
export const MAX_RESUME_BYTES = 4 * 1024 * 1024;

export type ResumeFileType = "pdf" | "docx";

export type ExtractError =
  /** Not a PDF or Word (.docx) file. */
  | "type"
  /** Empty, or larger than MAX_RESUME_BYTES. */
  | "size"
  /** A PDF with (almost) no text: usually a scan or an image. */
  | "scanned"
  /** A Word file with (almost) no text. */
  | "empty"
  /** More text than a resume should have. */
  | "too_long"
  /** Damaged or password-protected. */
  | "unreadable";

export type ExtractResult =
  | { ok: true; fileType: ResumeFileType; text: string }
  | { ok: false; error: ExtractError };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\3\4" (.docx is a zip)

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

/** The file's type from its name and its first bytes; both must agree. */
export function detectFileType(
  name: string,
  bytes: Uint8Array,
): ResumeFileType | null {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "pdf" && startsWith(bytes, PDF_MAGIC)) return "pdf";
  if (extension === "docx" && startsWith(bytes, ZIP_MAGIC)) return "docx";
  return null;
}

/** Tidy extracted text: no control characters, trimmed lines, few blanks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, (char) => (char === "\n" ? char : ""))
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function rawText(
  type: ResumeFileType,
  bytes: Uint8Array,
): Promise<string> {
  if (type === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(bytes),
  });
  return value;
}

/**
 * Reads the text of an uploaded resume. Errors are specific so the user
 * knows what to do (a scan needs a text-based version: there is no OCR).
 */
export async function extractResumeText(
  name: string,
  bytes: Uint8Array,
): Promise<ExtractResult> {
  if (bytes.length === 0 || bytes.length > MAX_RESUME_BYTES) {
    return { ok: false, error: "size" };
  }
  const fileType = detectFileType(name, bytes);
  if (!fileType) return { ok: false, error: "type" };

  let text: string;
  try {
    text = normalizeText(await rawText(fileType, bytes));
  } catch {
    return { ok: false, error: "unreadable" };
  }
  if (text.length < LIMITS.masterMin) {
    return { ok: false, error: fileType === "pdf" ? "scanned" : "empty" };
  }
  if (text.length > LIMITS.masterMax) return { ok: false, error: "too_long" };
  return { ok: true, fileType, text };
}
