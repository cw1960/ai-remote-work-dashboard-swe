import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";

import type { Resume } from "../../../supabase/functions/_shared/resume/schema";

/**
 * Downloadable resumes: a single-column layout with standard headings and
 * real text (no tables, columns, images or text boxes), which keeps them
 * easy for people and applicant-tracking systems to read.
 */

export type ResumeFormat = "docx" | "pdf";

export const MIME_TYPES: Record<ResumeFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/** Section headings, in English; the resume's own language may differ. */
export interface SectionLabels {
  summary: string;
  skills: string;
  experience: string;
  education: string;
  certifications: string;
}

interface Section {
  heading: string;
  blocks: Block[];
}

type Block =
  | { kind: "text"; text: string }
  | { kind: "entry"; title: string; meta: string | null }
  | { kind: "bullet"; text: string };

/** The resume as an ordered list of sections, shared by both formats. */
export function resumeSections(
  resume: Resume,
  labels: SectionLabels,
): Section[] {
  const sections: Section[] = [];
  if (resume.summary) {
    sections.push({
      heading: labels.summary,
      blocks: [{ kind: "text", text: resume.summary }],
    });
  }
  if (resume.skills.length > 0) {
    sections.push({
      heading: labels.skills,
      blocks: [{ kind: "text", text: resume.skills.join(" · ") }],
    });
  }
  if (resume.experience.length > 0) {
    sections.push({
      heading: labels.experience,
      blocks: resume.experience.flatMap((job): Block[] => [
        {
          kind: "entry",
          title: `${job.title}, ${job.employer}`,
          meta: [job.location, job.dates].filter(Boolean).join(" · ") || null,
        },
        ...job.bullets.map((text): Block => ({ kind: "bullet", text })),
      ]),
    });
  }
  if (resume.education.length > 0) {
    sections.push({
      heading: labels.education,
      blocks: resume.education.flatMap((item): Block[] => [
        {
          kind: "entry",
          title: `${item.credential}, ${item.institution}`,
          meta: item.dates,
        },
        ...item.details.map((text): Block => ({ kind: "bullet", text })),
      ]),
    });
  }
  if (resume.certifications.length > 0) {
    sections.push({
      heading: labels.certifications,
      blocks: resume.certifications.map((text) => ({ kind: "bullet", text })),
    });
  }
  for (const section of resume.other_sections) {
    sections.push({
      heading: section.heading,
      blocks: section.items.map((text) => ({ kind: "bullet", text })),
    });
  }
  return sections;
}

/** "Ana López - Spanish Tutor.docx", safe for every operating system. */
export function resumeFileName(
  name: string,
  jobTitle: string,
  format: ResumeFormat,
): string {
  const base = `${name} - ${jobTitle}`
    .normalize("NFKC")
    .replace(/[\p{Cc}<>:"/\\|?*]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${base || "Resume"}.${format}`;
}

// --- Word --------------------------------------------------------------------

const DOCX_FONT = "Calibri";

export async function resumeToDocx(
  resume: Resume,
  labels: SectionLabels,
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: resume.name, bold: true, size: 36 })],
    }),
  ];
  if (resume.headline) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: resume.headline, size: 24 })],
      }),
    );
  }
  if (resume.contact.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: resume.contact.join(" · "), size: 19 })],
      }),
    );
  }

  for (const section of resumeSections(resume, labels)) {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 4,
            color: "999999",
            space: 2,
          },
        },
        children: [
          new TextRun({
            text: section.heading.toUpperCase(),
            bold: true,
            size: 22,
          }),
        ],
      }),
    );
    for (const block of section.blocks) {
      if (block.kind === "text") {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: block.text, size: 21 })],
          }),
        );
      } else if (block.kind === "entry") {
        children.push(
          new Paragraph({
            spacing: { before: 120 },
            keepNext: true,
            children: [
              new TextRun({ text: block.title, bold: true, size: 21 }),
            ],
          }),
        );
        if (block.meta) {
          children.push(
            new Paragraph({
              keepNext: true,
              children: [
                new TextRun({
                  text: block.meta,
                  italics: true,
                  size: 19,
                  color: "555555",
                }),
              ],
            }),
          );
        }
      } else {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: block.text, size: 21 })],
          }),
        );
      }
    }
  }

  const document = new Document({
    creator: resume.name,
    title: resume.name,
    styles: { default: { document: { run: { font: DOCX_FONT } } } },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

// --- PDF ---------------------------------------------------------------------

/**
 * The PDF uses the standard Helvetica fonts, which cover Latin scripts
 * (English, Spanish, French, Portuguese, German, …). A resume with other
 * characters can't be drawn faithfully; we say so and offer Word instead.
 */
export class UnsupportedCharactersError extends Error {
  constructor() {
    super("unsupported_characters");
    this.name = "UnsupportedCharactersError";
  }
}

// US Letter, 0.75 in margins.
const PAGE = { width: 612, height: 792, margin: 54 };
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.35, 0.35, 0.4);

function supported(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Splits text into lines that fit `width` at `size`. */
export function wrapText(
  text: string,
  width: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= width || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function resumeToPdf(
  resume: Resume,
  labels: SectionLabels,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(resume.name);
  pdf.setAuthor(resume.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const sections = resumeSections(resume, labels);
  const allText = [
    resume.name,
    resume.headline ?? "",
    ...resume.contact,
    ...sections.flatMap((section) => [
      section.heading,
      ...section.blocks.map((block) =>
        block.kind === "entry"
          ? `${block.title} ${block.meta ?? ""}`
          : block.text,
      ),
    ]),
  ].join("\n");
  if (!supported(regular, allText.replace(/\n/g, " "))) {
    throw new UnsupportedCharactersError();
  }

  const contentWidth = PAGE.width - PAGE.margin * 2;
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const ensureRoom = (height: number) => {
    if (y - height < PAGE.margin) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const write = (
    text: string,
    options: {
      font: PDFFont;
      size: number;
      indent?: number;
      color?: typeof INK;
    },
  ) => {
    const indent = options.indent ?? 0;
    const lineHeight = options.size * 1.35;
    for (const line of wrapText(text, contentWidth - indent, (value) =>
      options.font.widthOfTextAtSize(value, options.size),
    )) {
      ensureRoom(lineHeight);
      y -= lineHeight;
      page.drawText(line, {
        x: PAGE.margin + indent,
        y: y + (lineHeight - options.size) / 2,
        size: options.size,
        font: options.font,
        color: options.color ?? INK,
      });
    }
  };

  write(resume.name, { font: bold, size: 20 });
  if (resume.headline) write(resume.headline, { font: regular, size: 12 });
  if (resume.contact.length > 0) {
    write(resume.contact.join("  ·  "), {
      font: regular,
      size: 9.5,
      color: MUTED,
    });
  }

  for (const section of sections) {
    ensureRoom(40);
    y -= 10;
    write(section.heading.toUpperCase(), { font: bold, size: 11 });
    page.drawLine({
      start: { x: PAGE.margin, y: y - 2 },
      end: { x: PAGE.width - PAGE.margin, y: y - 2 },
      thickness: 0.6,
      color: MUTED,
    });
    y -= 6;
    for (const block of section.blocks) {
      if (block.kind === "text") {
        write(block.text, { font: regular, size: 10 });
      } else if (block.kind === "entry") {
        ensureRoom(30);
        y -= 4;
        write(block.title, { font: bold, size: 10.5 });
        if (block.meta)
          write(block.meta, { font: italic, size: 9.5, color: MUTED });
      } else {
        // Room for the first line first, so the bullet and its text share a page.
        const lineHeight = 10 * 1.35;
        ensureRoom(lineHeight);
        page.drawText("•", {
          x: PAGE.margin + 2,
          y: y - lineHeight + (lineHeight - 10) / 2,
          size: 10,
          font: regular,
          color: INK,
        });
        write(block.text, { font: regular, size: 10, indent: 12 });
      }
    }
  }

  return pdf.save();
}
