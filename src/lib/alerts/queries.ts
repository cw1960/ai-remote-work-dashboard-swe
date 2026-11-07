import "server-only";

import { getSessionUser } from "@/lib/auth/session";
import type { FeedFilters } from "@/lib/jobs/filters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  type Frequency,
  type SavedFilters,
  savedFiltersSchema,
  toSavedFilters,
} from "./saved-search";

export interface SavedSearch {
  id: string;
  filters: SavedFilters;
  frequency: Frequency;
  platformNames: string[];
}

/** The signed-in user's saved searches, oldest first; [] when signed out. */
export async function getSavedSearches(): Promise<SavedSearch[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const [searches, platforms] = await Promise.all([
    supabase
      .from("saved_searches")
      .select("id, filters, frequency")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase.from("platforms").select("slug, name"),
  ]);
  if (searches.error) throw new Error(searches.error.message);
  if (platforms.error) throw new Error(platforms.error.message);
  const names = new Map(platforms.data.map((p) => [p.slug, p.name]));

  return searches.data.flatMap((row) => {
    const filters = savedFiltersSchema.safeParse(row.filters);
    if (!filters.success) return [];
    return [
      {
        id: row.id,
        filters: filters.data,
        frequency: row.frequency,
        platformNames: (filters.data.platforms ?? []).map(
          (slug) => names.get(slug) ?? slug,
        ),
      },
    ];
  });
}

/**
 * Whether the signed-in user has saved this feed search: null when signed
 * out (the button then leads to sign-in).
 */
export async function isSearchSaved(
  filters: FeedFilters,
): Promise<boolean | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("saved_searches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("filters", JSON.stringify(toSavedFilters(filters)));
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
