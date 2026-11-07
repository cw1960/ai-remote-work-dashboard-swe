import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * A client without a user session, for server code that acts for nobody in
 * particular (cron routes, unsubscribe links). Only what anon may do works;
 * token-gated functions check their own token.
 */
export function createSupabaseAnonClient() {
  const env = getPublicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
