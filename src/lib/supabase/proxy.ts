import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

type Apply = (response: NextResponse) => NextResponse;

/**
 * Refreshes the signed-in user's session for a page request. Server
 * Components can't set cookies, so this is where an expired access token
 * gets renewed. Returns a function that copies any new cookies (and the
 * no-cache headers that go with them) onto the final response.
 */
export async function refreshSession(request: NextRequest): Promise<Apply> {
  const env = getPublicEnv();
  const pending: Apply[] = [];

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            // Lets this render see the new session too.
            request.cookies.set(name, value);
          }
          pending.push((response) => {
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
            for (const [key, value] of Object.entries(headers)) {
              response.headers.set(key, value);
            }
            return response;
          });
        },
      },
    },
  );

  // Validates the token and refreshes it when needed. Don't remove.
  await supabase.auth.getClaims();

  return (response) =>
    pending.reduce((current, apply) => apply(current), response);
}
