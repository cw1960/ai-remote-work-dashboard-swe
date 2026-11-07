"use server";

import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PrefsResult = { ok: true } | { ok: false };

const prefsSchema = z.object({
  alerts_on: z.boolean(),
  reminders_on: z.boolean(),
  recap_on: z.boolean(),
});

const tokenSchema = z.string().regex(/^[a-z0-9]{32}$/);

/** Saves the signed-in user's email preferences. */
export async function updateMyEmailPrefs(input: unknown): Promise<PrefsResult> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const user = await getSessionUser();
  if (!user) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_prefs")
    .update(parsed.data)
    .eq("user_id", user.id)
    .select("user_id");
  if (error || data.length === 0) {
    if (error) console.error("email prefs not saved", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Saves email preferences with the unsubscribe token from an email. */
export async function updateEmailPrefsByToken(
  token: unknown,
  input: unknown,
): Promise<PrefsResult> {
  const parsedToken = tokenSchema.safeParse(token);
  const parsed = prefsSchema.safeParse(input);
  if (!parsedToken.success || !parsed.success) return { ok: false };

  const { data, error } = await createSupabaseAnonClient().rpc(
    "set_email_prefs_by_token",
    {
      p_token: parsedToken.data,
      p_alerts_on: parsed.data.alerts_on,
      p_reminders_on: parsed.data.reminders_on,
      p_recap_on: parsed.data.recap_on,
    },
  );
  if (error) console.error("email prefs not saved", error);
  return { ok: !error && data };
}
