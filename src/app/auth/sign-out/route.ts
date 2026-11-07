import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Only same-site form posts may sign someone out. */
const fetchSiteSchema = z.enum(["same-origin", "same-site", "none"]);

/**
 * POST /auth/sign-out — the header's "Sign out" form posts here.
 *
 * A route rather than a server action, so it keeps working on pages loaded
 * before a deploy (server action ids change with every build). The session
 * cookies are removed even if Supabase can't be reached.
 */
export async function POST(request: NextRequest) {
  const site = fetchSiteSchema.safeParse(
    request.headers.get("sec-fetch-site") ?? "none",
  );
  if (!site.success) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("sign-out at Supabase failed", error);

  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (/^sb-.+-auth-token(\.\d+)?$/.test(cookie.name)) {
      cookieStore.delete(cookie.name);
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
}
