import "server-only";

import { getSessionUser } from "@/lib/auth/session";
import { getListedPlatforms } from "@/lib/profile/queries";
import type { MembershipStatus } from "@/lib/profile/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PassportEntry {
  slug: string;
  name: string;
  status: MembershipStatus;
  /** "YYYY-MM-DD" the user may apply again, after a rejection. */
  reapplyAfter: string | null;
  openJobs: number;
}

/** The signed-in user's status on every listed platform. */
export async function getPassport(): Promise<PassportEntry[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const [platforms, memberships] = await Promise.all([
    getListedPlatforms(),
    supabase
      .from("platform_memberships")
      .select("platform_id, status, reapply_after")
      .eq("user_id", user.id),
  ]);
  if (memberships.error) throw new Error(memberships.error.message);
  const byPlatform = new Map(
    memberships.data.map((row) => [row.platform_id, row]),
  );

  return Promise.all(
    platforms.map(async (platform) => {
      const { count, error } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("platform_id", platform.id)
        .eq("status", "open");
      if (error) throw new Error(error.message);
      const membership = byPlatform.get(platform.id);
      return {
        slug: platform.slug,
        name: platform.name,
        status: membership?.status ?? "not_joined",
        reapplyAfter: membership?.reapply_after ?? null,
        openJobs: count ?? 0,
      };
    }),
  );
}
