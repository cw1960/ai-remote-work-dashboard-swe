import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { EMAIL_LISTS, unsubscribeArgs } from "@/lib/email/prefs";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

const paramsSchema = z.object({
  token: z.string().regex(/^[a-z0-9]{32}$/),
  list: z.enum(EMAIL_LISTS),
});

/**
 * POST /api/unsubscribe?token=…&list=reminders — RFC 8058 one-click
 * unsubscribe, sent by mail apps (Gmail, Outlook…) from the
 * List-Unsubscribe header. People clicking the link in an email get the
 * /unsubscribe page instead.
 */
export async function POST(request: NextRequest) {
  const parsed = paramsSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid link" }, { status: 400 });
  }
  const { token, list } = parsed.data;
  const { data, error } = await createSupabaseAnonClient().rpc(
    "set_email_prefs_by_token",
    { p_token: token, ...unsubscribeArgs(list) },
  );
  if (error) {
    console.error("unsubscribe failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "unknown link" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
