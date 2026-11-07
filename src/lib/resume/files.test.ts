import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import { TAILORED_RESUME } from "../../../supabase/functions/_shared/resume/fixtures";

import {
  detectFileType,
  extractResumeText,
  MAX_RESUME_BYTES,
  normalizeText,
} from "./extract";
import {
  resumeFileName,
  resumeSections,
  resumeToDocx,
  resumeToPdf,
  UnsupportedCharactersError,
  wrapText,
} from "./export";

vi.mock("server-only", () => ({}));

const LABELS = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
};

describe("downloads", () => {
  it("writes a Word file whose text can be read back", async () => {
    const bytes = new Uint8Array(await resumeToDocx(TAILORED_RESUME, LABELS));
    const result = await extractResumeText("resume.docx", bytes);
    if (!result.ok) throw new Error(result.error);
    expect(result.fileType).toBe("docx");
    expect(result.text).toContain("Ana López");
    expect(result.text).toContain("Spanish Teacher, Colegio Sol");
    expect(result.text).toContain("EXPERIENCE");
    expect(result.text).toContain(
      "Graded written assignments against detailed rubrics.",
    );
  });

  it("writes a PDF with selectable text", async () => {
    const bytes = await resumeToPdf(TAILORED_RESUME, LABELS);
    const result = await extractResumeText("resume.pdf", bytes);
    if (!result.ok) throw new Error(result.error);
    expect(result.fileType).toBe("pdf");
    expect(result.text).toContain("Ana López");
    expect(result.text).toContain("Universidad Autónoma de Nuevo León");
    expect(result.text).toContain("raised test scores by 18%");
  });

  it("starts a new page when a long resume fills one", async () => {
    const long = structuredClone(TAILORED_RESUME);
    long.experience[0]?.bullets.push(
      ...Array.from(
        { length: 80 },
        (_, i) => `Achievement number ${String(i)}.`,
      ),
    );
    const pdf = await PDFDocument.load(await resumeToPdf(long, LABELS));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("explains when a PDF can't show the resume's characters", async () => {
    const resume = { ...TAILORED_RESUME, name: "张伟" };
    await expect(resumeToPdf(resume, LABELS)).rejects.toBeInstanceOf(
      UnsupportedCharactersError,
    );
    // Word handles any script.
    const docx = new Uint8Array(await resumeToDocx(resume, LABELS));
    const result = await extractResumeText("r.docx", docx);
    expect(result.ok && result.text.includes("张伟")).toBe(true);
  });

  it("orders sections conventionally and skips empty ones", () => {
    const sections = resumeSections(
      { ...TAILORED_RESUME, summary: null, certifications: [] },
      LABELS,
    );
    expect(sections.map((s) => s.heading)).toEqual([
      "Skills",
      "Experience",
      "Education",
    ]);
  });

  it("names the file after the person and the job, safely", () => {
    expect(resumeFileName("Ana López", "Tutor / Grader: ES", "pdf")).toBe(
      "Ana López - Tutor Grader ES.pdf",
    );
    expect(resumeFileName("", "", "docx")).toBe("-.docx");
  });

  it("wraps text to the available width", () => {
    expect(wrapText("one two three four", 9, (value) => value.length)).toEqual([
      "one two",
      "three",
      "four",
    ]);
  });
});

describe("extractResumeText", () => {
  it("rejects files that are not PDF or Word", async () => {
    const bytes = new TextEncoder().encode("plain text pretending to be a PDF");
    expect(await extractResumeText("resume.pdf", bytes)).toEqual({
      ok: false,
      error: "type",
    });
    expect(await extractResumeText("resume.doc", bytes)).toEqual({
      ok: false,
      error: "type",
    });
  });

  it("rejects empty and oversized files", async () => {
    expect(await extractResumeText("r.pdf", new Uint8Array())).toEqual({
      ok: false,
      error: "size",
    });
    expect(
      await extractResumeText("r.pdf", new Uint8Array(MAX_RESUME_BYTES + 1)),
    ).toEqual({ ok: false, error: "size" });
  });

  it("recognises a PDF without text as a scan", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    expect(await extractResumeText("scan.pdf", await pdf.save())).toEqual({
      ok: false,
      error: "scanned",
    });
  });

  it("reports a damaged file", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 not really a pdf");
    expect(await extractResumeText("broken.pdf", bytes)).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("checks the file's content, not just its name", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7");
    expect(detectFileType("resume.PDF", pdf)).toBe("pdf");
    expect(detectFileType("resume.docx", pdf)).toBeNull();
  });
});

describe("normalizeText", () => {
  it("drops control characters and extra blank lines", () => {
    expect(normalizeText("  Ana\u0000 López \r\n\r\n\r\n\tTeacher​ ")).toBe(
      "Ana López\n\nTeacher",
    );
  });
});
