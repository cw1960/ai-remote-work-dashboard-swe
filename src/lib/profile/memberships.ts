import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ListedPlatform } from "./queries";
import { type MembershipStatus, stageForMembership } from "./schema";

/**
 * Records the user's status on a platform and keeps its board card in step:
 * a platform they've joined gets an onboarding card (once), and with
 * `moveCard` an existing card follows the status to its column.
 */
export async function saveMembership(
  userId: string,
  platform: ListedPlatform,
  status: MembershipStatus,
  options: { reapplyAfter?: string | null; moveCard?: boolean } = {},
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const reapplyAfter =
    status === "rejected" ? (options.reapplyAfter ?? null) : null;
  const fields = {
    status,
    ...(options.reapplyAfter === undefined && status === "rejected"
      ? {}
      : { reapply_after: reapplyAfter }),
  };

  // Users may only write these columns (RLS migration); user_id is
  // filled in by default, so update-or-insert rather than upsert.
  const { data: updated, error: updateError } = await supabase
    .from("platform_memberships")
    .update(fields)
    .eq("user_id", userId)
    .eq("platform_id", platform.id)
    .select("id, applied_at");
  if (updateError) throw new Error(updateError.message);
  const appliedAt = status === "not_joined" ? null : new Date().toISOString();
  if (updated.length === 0) {
    const { error } = await supabase
      .from("platform_memberships")
      .insert({ platform_id: platform.id, ...fields, applied_at: appliedAt });
    if (error) throw new Error(error.message);
  } else if (appliedAt && updated.every((row) => row.applied_at === null)) {
    const { error } = await supabase
      .from("platform_memberships")
      .update({ applied_at: appliedAt })
      .eq("user_id", userId)
      .eq("platform_id", platform.id);
    if (error) throw new Error(error.message);
  }

  const stage = stageForMembership(status);
  if (!stage) return;
  const { data: existing, error: readError } = await supabase
    .from("tracker_cards")
    .select("id, stage")
    .eq("user_id", userId)
    .eq("kind", "platform")
    .eq("platform_id", platform.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (existing) {
    if (!options.moveCard || existing.stage === stage) return;
    const { error } = await supabase
      .from("tracker_cards")
      .update({ stage })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error: insertError } = await supabase.from("tracker_cards").insert({
    kind: "platform",
    platform_id: platform.id,
    title: platform.name,
    stage,
  });
  if (insertError) throw new Error(insertError.message);
}
