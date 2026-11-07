"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STAGES } from "@/lib/tracker/stages";

export type InboundResult =
  { ok: true } | { ok: false; error: "invalid" | "auth" | "failed" };

const resolveSchema = z.object({
  id: z.uuid(),
  /** Null: a new card for the email's platform. */
  cardId: z.uuid().nullable(),
  stage: z.enum(STAGES),
});

/** Files a forwarded email under a card (moving it) or a new card. */
export async function resolveInboundEmail(
  input: unknown,
): Promise<InboundResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_inbound_email", {
    p_email_id: parsed.data.id,
    p_stage: parsed.data.stage,
    ...(parsed.data.cardId ? { p_card_id: parsed.data.cardId } : {}),
  });
  if (error) {
    console.error("inbound email not resolved", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true };
}

const ignoreSchema = z.object({ id: z.uuid() });

/** Dismisses a forwarded email. */
export async function ignoreInboundEmail(
  input: unknown,
): Promise<InboundResult> {
  const parsed = ignoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inbound_emails")
    .update({ status: "ignored" })
    .eq("user_id", user.id)
    .eq("id", parsed.data.id)
    .eq("status", "needs_review")
    .select("id");
  if (error) {
    console.error("inbound email not ignored", error);
    return { ok: false, error: "failed" };
  }
  if (data.length === 0) return { ok: false, error: "invalid" };
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true };
}
