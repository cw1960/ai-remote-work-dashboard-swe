import "server-only";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Stage } from "@/lib/tracker/stages";

/** A forwarded email the rules weren't sure about. */
export interface ReviewEmail {
  id: string;
  fromDomain: string;
  subject: string | null;
  receivedAt: string;
  platform: string | null;
  stage: Stage | null;
}

/** The signed-in user's forwarded emails that need review, newest first. */
export async function getEmailsToReview(): Promise<ReviewEmail[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inbound_emails")
    .select(
      "id, from_domain, subject, received_at, matched_stage, platform:platforms(name)",
    )
    .eq("user_id", user.id)
    .eq("status", "needs_review")
    .order("received_at", { ascending: false })
    .limit(20);
  // Auto-capture is extra: without it the dashboard still works.
  if (error) {
    console.error("inbound emails not loaded", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    fromDomain: row.from_domain,
    subject: row.subject,
    receivedAt: row.received_at,
    platform: row.platform?.name ?? null,
    stage: row.matched_stage,
  }));
}
