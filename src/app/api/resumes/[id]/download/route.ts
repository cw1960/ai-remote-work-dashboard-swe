import { getTranslations } from "next-intl/server";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { getSessionUser } from "@/lib/auth/session";
import {
  MIME_TYPES,
  resumeFileName,
  resumeToDocx,
  resumeToPdf,
  UnsupportedCharactersError,
} from "@/lib/resume/export";
import { getTailoredResume } from "@/lib/resume/queries";

const querySchema = z.object({ format: z.enum(["docx", "pdf"]) });
const idSchema = z.guid();

/**
 * GET /api/resumes/<id>/download?format=docx|pdf — the user's tailored
 * resume as a file, built on request (nothing is stored). Another user's id
 * answers 404, exactly like an unknown one.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/resumes/[id]/download">,
) {
  const { id } = await context.params;
  const query = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success || !idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const tailored = await getTailoredResume(id);
  if (!tailored) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const t = await getTranslations({
    locale: routing.defaultLocale,
    namespace: "ResumeFile",
  });
  const labels = {
    summary: t("summary"),
    skills: t("skills"),
    experience: t("experience"),
    education: t("education"),
    certifications: t("certifications"),
  };
  const { format } = query.data;

  let body: Uint8Array;
  try {
    body =
      format === "docx"
        ? new Uint8Array(await resumeToDocx(tailored.resume, labels))
        : await resumeToPdf(tailored.resume, labels);
  } catch (error) {
    if (error instanceof UnsupportedCharactersError) {
      return NextResponse.json(
        { error: "unsupported_characters" },
        { status: 422 },
      );
    }
    throw error;
  }

  const fileName = resumeFileName(
    tailored.resume.name,
    tailored.jobTitle,
    format,
  );
  return new NextResponse(new Blob([body as BlobPart]), {
    headers: {
      "Content-Type": MIME_TYPES[format],
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
