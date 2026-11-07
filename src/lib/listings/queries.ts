import "server-only";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Whether the signed-in user may use the admin pages. */
export async function isAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("admin check failed", error);
    return false;
  }
  return data;
}

export async function getAdminPlatforms() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_platforms");
  if (error) throw new Error(error.message);
  return data;
}

export async function getAdminListings() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_listings");
  if (error) throw new Error(error.message);
  return data;
}

export type AdminListing = Awaited<ReturnType<typeof getAdminListings>>[number];
export type AdminPlatform = Awaited<
  ReturnType<typeof getAdminPlatforms>
>[number];
