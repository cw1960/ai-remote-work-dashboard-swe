"use server";

import { getSessionUser } from "@/lib/auth/session";
import { welcomeEmail } from "@/lib/email/messages";
import { sendBatch } from "@/lib/email/send";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { saveMembership } from "./memberships";
import { getListedPlatforms } from "./queries";
import { type OnboardingStep, onboardingStepSchema } from "./schema";

export type SaveResult =
  { ok: true } | { ok: false; error: "invalid" | "auth" | "failed" };

/** Saves one onboarding step for the signed-in user. */
export async function saveOnboardingStep(input: unknown): Promise<SaveResult> {
  const parsed = onboardingStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  try {
    await save(user.id, parsed.data);
    return { ok: true };
  } catch (error) {
    console.error("onboarding step not saved", error);
    return { ok: false, error: "failed" };
  }
}

/** Marks onboarding as done (skipped steps can be filled in later). */
export async function finishOnboarding(): Promise<SaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("onboarded_at", null);
  if (error) {
    console.error("onboarding not finished", error);
    return { ok: false, error: "failed" };
  }
  await sendWelcomeEmail();
  return { ok: true };
}

/**
 * Sends the welcome email once per user (claim_welcome_email marks it).
 * Where email is off (deploy previews, local) nothing is claimed, so the
 * user still gets it later. Never fails onboarding: errors are only logged.
 */
async function sendWelcomeEmail(): Promise<void> {
  try {
    if (!getServerEnv().RESEND_API_KEY) return;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("claim_welcome_email");
    if (error) throw new Error(error.message);
    const recipient = data[0];
    if (!recipient) return;
    const email = await welcomeEmail({
      to: recipient.email,
      locale: recipient.locale,
      unsubscribeToken: recipient.unsubscribe_token,
    });
    const result = await sendBatch([email], `welcome/${recipient.email}`);
    if (result === "failed") console.error("welcome email not sent");
  } catch (error) {
    console.error("welcome email not sent", error);
  }
}

async function save(userId: string, step: OnboardingStep): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const updateProfile = async (
    values: Database["public"]["Tables"]["profiles"]["Update"],
  ) => {
    const { error } = await supabase
      .from("profiles")
      .update(values)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  };

  switch (step.step) {
    case "expertise":
      return updateProfile({ domains: step.domains, skills: step.skills });
    case "languages":
      return updateProfile({ languages: step.languages });
    case "location":
      return updateProfile({ country: step.country });
    case "availability":
      return updateProfile({
        hours_per_week: step.hoursPerWeek,
        target_rate: step.targetRate,
      });
    case "platforms":
      return savePlatforms(userId, step.statuses);
  }
}

/** Records the user's status on each listed platform (see saveMembership). */
async function savePlatforms(
  userId: string,
  statuses: Extract<OnboardingStep, { step: "platforms" }>["statuses"],
): Promise<void> {
  const platforms = await getListedPlatforms();
  for (const platform of platforms) {
    const status = statuses[platform.slug];
    if (status) await saveMembership(userId, platform, status);
  }
}
