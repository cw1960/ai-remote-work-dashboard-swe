import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { describeLabels } from "@/lib/alerts/labels";
import {
  describeSearch,
  savedFiltersSchema,
  toFeedFilters,
} from "@/lib/alerts/saved-search";
import {
  type AlertSearchInput,
  emailLocale,
  jobAlertEmail,
} from "@/lib/email/messages";
import { BATCH_SIZE, type OutgoingEmail, sendBatch } from "@/lib/email/send";
import { toSearchParams } from "@/lib/jobs/filters";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

const bodySchema = z.object({ at: z.iso.datetime({ offset: true }) });
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

const jobsSchema = z.array(
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

interface UserAlert {
  email: string;
  locale: string;
  unsubscribeToken: string;
  searchIds: string[];
  searches: AlertSearchInput[];
}

/**
 * POST /api/cron/alerts  {"at": ISO timestamp}, header x-cron-token.
 *
 * Called daily by pg_cron (private.invoke_job_alerts). One email per person
 * listing new jobs for each of their due saved searches. Searches with
 * nothing new are marked as checked without an email.
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
  const at = new Date(body.data.at).toISOString();

  const supabase = createSupabaseAnonClient();
  const { data: due, error } = await supabase.rpc("due_job_alerts", {
    p_token: token.data,
    p_now: at,
  });
  if (error) {
    if (error.code === BAD_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("due job alerts not loaded", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  const mark = async (ids: string[]) => {
    if (ids.length === 0) return;
    const marked = await supabase.rpc("mark_job_alerts_sent", {
      p_token: token.data,
      p_search_ids: ids,
      p_at: at,
    });
    if (marked.error) console.error("job alerts not marked", marked.error);
  };

  // Nothing new: checked, no email.
  await mark(due.filter((row) => row.total === 0).map((row) => row.search_id));

  const byUser = new Map<string, UserAlert>();
  for (const row of due) {
    if (row.total === 0) continue;
    const filters = savedFiltersSchema.safeParse(row.filters);
    if (!filters.success) continue;
    const locale = emailLocale(row.locale);
    const description = describeSearch(
      filters.data,
      row.platform_names,
      await describeLabels(locale),
    );
    const entry = byUser.get(row.user_id) ?? {
      email: row.email,
      locale,
      unsubscribeToken: row.unsubscribe_token,
      searchIds: [],
      searches: [],
    };
    entry.searchIds.push(row.search_id);
    entry.searches.push({
      description,
      frequency: row.frequency,
      feedQuery: toSearchParams(toFeedFilters(filters.data)).toString(),
      total: row.total,
      jobs: jobsSchema.parse(row.jobs),
    });
    byUser.set(row.user_id, entry);
  }

  const users = [...byUser.values()];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (let start = 0; start < users.length; start += BATCH_SIZE) {
    const chunk = users.slice(start, start + BATCH_SIZE);
    const emails: OutgoingEmail[] = await Promise.all(
      chunk.map((user) =>
        jobAlertEmail({
          to: user.email,
          locale: user.locale,
          unsubscribeToken: user.unsubscribeToken,
          searches: user.searches,
        }),
      ),
    );
    const result = await sendBatch(
      emails,
      `alerts/${at}/${chunk.flatMap((user) => user.searchIds).join(",")}`,
    );
    if (result === "sent") {
      sent += chunk.length;
      await mark(chunk.flatMap((user) => user.searchIds));
    } else if (result === "skipped") {
      skipped += chunk.length;
    } else {
      failed += chunk.length;
    }
  }

  return NextResponse.json(
    { at, due: due.length, people: users.length, sent, skipped, failed },
    { status: failed > 0 ? 502 : 200 },
  );
}
