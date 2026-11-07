import "server-only";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { MembershipStatus } from "./schema";

export interface ListedPlatform {
  id: string;
  slug: string;
  name: string;
}

/**
 * Platforms people can track: the listed ones (CLAUDE.md), referral
 * platforms first.
 */
export async function getListedPlatforms(): Promise<ListedPlatform[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("platforms")
    .select("id, slug, name")
    .eq("listed", true)
    .order("has_referral", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}

export interface OnboardingData {
  profile: {
    domains: string[];
    skills: string[];
    languages: string[];
    country: string | null;
    hoursPerWeek: number | null;
    targetRate: number | null;
    onboardedAt: string | null;
  };
  /** Status per platform slug; platforms not listed are "not_joined". */
  statuses: Record<string, MembershipStatus>;
  platforms: ListedPlatform[];
}

/** The signed-in user's answers so far; null when signed out. */
export async function getOnboardingData(): Promise<OnboardingData | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const [profile, memberships, platforms] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "domains, skills, languages, country, hours_per_week, target_rate, onboarded_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("platform_memberships")
      .select("status, platform:platforms!inner(slug)")
      .eq("user_id", user.id),
    getListedPlatforms(),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  if (memberships.error) throw new Error(memberships.error.message);

  const row = profile.data;
  return {
    profile: {
      domains: row?.domains ?? [],
      skills: row?.skills ?? [],
      languages: row?.languages ?? [],
      country: row?.country ?? null,
      hoursPerWeek: row?.hours_per_week ?? null,
      targetRate: row?.target_rate ?? null,
      onboardedAt: row?.onboarded_at ?? null,
    },
    statuses: Object.fromEntries(
      memberships.data.map((m) => [m.platform.slug, m.status]),
    ),
    platforms,
  };
}

/** Whether the signed-in user still has to see onboarding. */
export async function needsOnboarding(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !data?.onboarded_at;
}
