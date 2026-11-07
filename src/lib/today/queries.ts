import "server-only";

import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Records this dashboard view; returns when the previous visit began (null
 * on the first). Failures only lose the "new matches" line, so they're
 * logged rather than thrown.
 */
export async function recordDashboardVisit(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("dashboard_visit");
  if (error) {
    console.error(`dashboard_visit failed: ${error.message}`);
    return null;
  }
  return z.string().nullable().parse(data);
}
