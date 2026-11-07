import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { playbookConfig } from "@/config/playbook";
import { playbookPath, seeOther } from "@/lib/playbook/paths";
import { checkPurchase } from "@/lib/playbook/stripe";

/**
 * GET /api/playbook/download?session_id=cs_… — the PDF, for a paid,
 * unrefunded purchase within the download window. Anything else goes to
 * the thank-you page, which explains.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  const thanks = seeOther(
    `${playbookPath(request.headers.get("host"), "/thanks")}?session_id=${encodeURIComponent(sessionId)}`,
  );

  const { status } = await checkPurchase(sessionId);
  if (status !== "paid") return thanks;

  const pdf = await readFile(
    join(process.cwd(), "content", "playbook", playbookConfig.pdfFile),
  );
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${playbookConfig.pdfFileName}"`,
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
