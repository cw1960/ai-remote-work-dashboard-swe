import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recapEmail } from "@/lib/email/messages";
import { BATCH_SIZE, sendBatch } from "@/lib/email/send";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

const bodySchema = z.object({ day: z.iso.date() });
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

const matchesSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    platform: z.string(),
    pay_min: z.number().nullable(),
    pay_max: z.number().nullable(),
    pay_unit: z.string().nullable(),
  }),
);

/** Postgres invalid_authorization_specification, raised for a bad token. */
const BAD_TOKEN = "28000";

/**
 * POST /api/cron/recap  {"day": "YYYY-MM-DD"}, header x-cron-token.
 *
 * Called on Mondays by pg_cron (private.invoke_recaps). Emails everyone with
 * recaps on their past week and top matches, at most once a week each. The
 * token is checked by the database functions, which hold it in Vault.
 */
export async function POST(request: NextRequest) {
  const token = tokenSchema.safeParse(request.headers.get("x-cron-token"));
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!token.success) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { day } = body.data;

  const supabase = createSupabaseAnonClient();
  const { data: due, error } = await supabase.rpc("due_recaps", {
    p_token: token.data,
    p_day: day,
  });
  if (error) {
    if (error.code === BAD_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("due recaps not loaded", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (let start = 0; start < due.length; start += BATCH_SIZE) {
    const chunk = due.slice(start, start + BATCH_SIZE);
    const emails = await Promise.all(
      chunk.map((row) =>
        recapEmail({
          to: row.email,
          locale: row.locale,
          unsubscribeToken: row.unsubscribe_token,
          recap: {
            applied: row.applied,
            responses: row.responses,
            moves: row.moves,
            matches: matchesSchema.parse(row.matches),
          },
        }),
      ),
    );
    const result = await sendBatch(
      emails,
      `recap/${day}/${chunk.map((row) => row.user_id).join(",")}`,
    );
    if (result !== "sent") {
      if (result === "skipped") skipped += chunk.length;
      else failed += chunk.length;
      continue;
    }
    sent += chunk.length;
    for (const row of chunk) {
      const marked = await supabase.rpc("mark_recap_sent", {
        p_token: token.data,
        p_user_id: row.user_id,
        p_day: day,
      });
      if (marked.error) console.error("recap not marked", marked.error);
    }
  }

  return NextResponse.json(
    { day, due: due.length, sent, skipped, failed },
    { status: failed > 0 ? 502 : 200 },
  );
}
