"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { FREQUENCIES, parseFeedQuery, toSavedFilters } from "./saved-search";

export type SearchResult =
  { ok: true } | { ok: false; error: "invalid" | "auth" | "limit" | "failed" };

/** Postgres unique_violation: this search is already saved. */
const UNIQUE_VIOLATION = "23505";
/** Raised by the 10-searches limit trigger. */
const LIMIT_REACHED = "P0010";

const saveSchema = z.object({
  /** The feed's query string, e.g. "q=law&domain=law". */
  query: z.string().max(2000),
  frequency: z.enum(FREQUENCIES),
});

/** Saves a feed search for alerts. Saving it again is fine. */
export async function saveSearch(input: unknown): Promise<SearchResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("saved_searches").insert({
    filters: toSavedFilters(parseFeedQuery(parsed.data.query)),
    frequency: parsed.data.frequency,
  });
  if (error && error.code !== UNIQUE_VIOLATION) {
    if (error.code === LIMIT_REACHED) return { ok: false, error: "limit" };
    console.error("search not saved", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/settings", "page");
  return { ok: true };
}

const frequencySchema = z.object({
  id: z.uuid(),
  frequency: z.enum(FREQUENCIES),
});

/** Switches a saved search between daily and weekly alerts. */
export async function setSearchFrequency(
  input: unknown,
): Promise<SearchResult> {
  const parsed = frequencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_searches")
    .update({ frequency: parsed.data.frequency })
    .eq("user_id", user.id)
    .eq("id", parsed.data.id)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("search frequency not saved", error);
    return { ok: false, error: error ? "failed" : "invalid" };
  }
  return { ok: true };
}

const deleteSchema = z.object({ id: z.uuid() });

/** Deletes a saved search (its alerts stop). */
export async function deleteSearch(input: unknown): Promise<SearchResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("user_id", user.id)
    .eq("id", parsed.data.id)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("search not deleted", error);
    return { ok: false, error: error ? "failed" : "invalid" };
  }
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/settings", "page");
  return { ok: true };
}
