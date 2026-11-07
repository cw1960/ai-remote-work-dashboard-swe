import "server-only";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Accounts per page on /admin/users. */
export const USERS_PAGE_SIZE = 50;

const siteStatsSchema = z.object({
  accounts: z.number(),
  new_7d: z.number(),
  new_30d: z.number(),
  onboarded: z.number(),
  active_7d: z.number(),
  cards: z.number(),
  applied: z.number(),
});
export type SiteStats = z.infer<typeof siteStatsSchema>;

export async function getSiteStats(): Promise<SiteStats> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_site_stats");
  if (error) throw new Error(error.message);
  return siteStatsSchema.parse(data);
}

export async function getSignupStats() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_signup_stats");
  if (error) throw new Error(error.message);
  return data;
}

export async function getSourceHealth() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_source_health");
  if (error) throw new Error(error.message);
  return data;
}

/** One page of accounts, newest first; `page` starts at 1. */
export async function getUsers(search: string, page: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_users", {
    p_search: search,
    p_limit: USERS_PAGE_SIZE,
    p_offset: (page - 1) * USERS_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  return { users: data, total: data[0]?.total ?? 0 };
}

export type SignupStat = Awaited<ReturnType<typeof getSignupStats>>[number];
export type SourceHealth = Awaited<ReturnType<typeof getSourceHealth>>[number];
export type AdminUser = Awaited<ReturnType<typeof getUsers>>["users"][number];

const newsletterCostSchema = z.object({
  last_7d: z.number(),
  last_30d: z.number(),
  this_month: z.number(),
});
export type NewsletterCost = z.infer<typeof newsletterCostSchema>;

/** Newsletter model spend in USD: last 7 and 30 days, this month. */
export async function getNewsletterCost(): Promise<NewsletterCost> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_newsletter_cost");
  if (error) throw new Error(error.message);
  return newsletterCostSchema.parse(data);
}

/** The latest newsletter workflow runs, newest first. */
export async function getNewsletterRuns() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_newsletter_runs");
  if (error) throw new Error(error.message);
  return data;
}

/** A run's job shortlist and social drafts. */
export async function getNewsletterRun(runId: string) {
  const supabase = await createSupabaseServerClient();
  const [shortlist, drafts] = await Promise.all([
    supabase.rpc("admin_newsletter_shortlist", { p_run_id: runId }),
    supabase.rpc("admin_newsletter_drafts", { p_run_id: runId }),
  ]);
  if (shortlist.error) throw new Error(shortlist.error.message);
  if (drafts.error) throw new Error(drafts.error.message);
  return { shortlist: shortlist.data, drafts: drafts.data };
}

export type NewsletterRun = Awaited<
  ReturnType<typeof getNewsletterRuns>
>[number];
