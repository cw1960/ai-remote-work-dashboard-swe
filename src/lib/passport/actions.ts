"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
import { saveMembership } from "@/lib/profile/memberships";
import { getListedPlatforms } from "@/lib/profile/queries";

import { passportUpdateSchema } from "./schema";

export type PassportResult =
  { ok: true } | { ok: false; error: "invalid" | "auth" | "failed" };

/**
 * Sets the user's status on a platform from the Platform Passport; the
 * platform's board card follows it to the matching column.
 */
export async function updatePassport(input: unknown): Promise<PassportResult> {
  const parsed = passportUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const { platform: slug, status, reapplyAfter } = parsed.data;

  try {
    const platform = (await getListedPlatforms()).find((p) => p.slug === slug);
    if (!platform) return { ok: false, error: "invalid" };
    await saveMembership(user.id, platform, status, {
      ...(reapplyAfter === undefined ? {} : { reapplyAfter }),
      moveCard: true,
    });
  } catch (error) {
    console.error("passport not saved", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true };
}
