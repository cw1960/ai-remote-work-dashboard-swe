import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { siteConfig } from "@/config/site";
import {
  newsletterDraftsEmail,
  newsletterIssueEmail,
} from "@/lib/email/messages";
import { sendBatch } from "@/lib/email/send";
import {
  groupDraftsByRecipient,
  unsentDraftSchema,
} from "@/lib/newsletter/drafts";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

const bodySchema = z.object({
  runId: z.uuid(),
  /** A daily run's issue, saved in Beehiiv as a draft for the editor. */
  issue: z
    .object({
      issueDate: z.iso.date(),
      subject: z.string().trim().min(1).max(200),
      editorUrl: z.url().startsWith("https://app.beehiiv.com/posts/").max(300),
      flags: z.array(z.string().trim().min(1).max(500)).max(30),
    })
    .optional(),
});
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Postgres invalid_authorization_specification, raised for a bad token. */
const BAD_TOKEN = "28000";

/**
 * POST /api/newsletter/notify  {"runId": "<uuid>", "issue"?: {...}},
 * header x-newsletter-token.
 *
 * Called by the newsletter workflow (cw1960/airemoteworktoday) after it
 * saves a run's social drafts, or a daily run's issue as a Beehiiv draft.
 * Emails the social drafts through Resend, LinkedIn drafts to the editor and the
 * rest to the owner, and marks them sent; emails the owner the issue's
 * Beehiiv editor link and its open checks. The token is checked by the
 * database functions, which hold it in Vault. Without RESEND_API_KEY
 * (previews, local, CI) nothing is sent or marked.
 */
export async function POST(request: NextRequest) {
  const token = tokenSchema.safeParse(
    request.headers.get("x-newsletter-token"),
  );
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!token.success) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { runId, issue } = body.data;

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.rpc("newsletter_unsent_drafts", {
    p_token: token.data,
    p_run_id: runId,
  });
  if (error) {
    if (error.code === BAD_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("newsletter drafts not loaded", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const drafts = z.array(unsentDraftSchema).parse(data);

  // The token is valid (the query above checked it), so the issue email
  // goes out whether or not the run has social drafts.
  const issueResult = issue
    ? await sendBatch(
        [
          await newsletterIssueEmail({
            to: siteConfig.newsletter.draftsTo.other,
            ...issue,
          }),
        ],
        `newsletter-issue/${runId}`,
      )
    : undefined;

  const first = drafts[0];
  if (!first) {
    return NextResponse.json(
      { runId, drafts: 0, result: "nothing to send", issue: issueResult },
      { status: issueResult === "failed" ? 502 : 200 },
    );
  }

  const emails = await Promise.all(
    groupDraftsByRecipient(drafts).map((group) =>
      newsletterDraftsEmail({
        to: group.to,
        kind: first.kind,
        issueDate: first.issue_date,
        drafts: group.drafts,
      }),
    ),
  );
  const ids = drafts.map((draft) => draft.id);
  const result = await sendBatch(emails, `newsletter-drafts/${ids.join(",")}`);
  if (result === "sent") {
    const marked = await supabase.rpc("newsletter_mark_drafts_emailed", {
      p_token: token.data,
      p_ids: ids,
    });
    if (marked.error) console.error("drafts not marked", marked.error);
  }

  return NextResponse.json(
    {
      runId,
      drafts: drafts.length,
      emails: emails.length,
      result,
      issue: issueResult,
    },
    { status: result === "failed" || issueResult === "failed" ? 502 : 200 },
  );
}
