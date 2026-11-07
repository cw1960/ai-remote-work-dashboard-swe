import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { playbookConfig } from "./config/playbook";
import { siteConfig } from "./config/site";
import { routing } from "./i18n/routing";
import { refreshSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

/** Paths the Playbook sub-domain serves itself (the rest is the main site). */
const PLAYBOOK_PATHS = new Set(["/", "/thanks"]);

export default async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0];
  const { pathname, search } = request.nextUrl;

  // playbook.<domain>: the sales page at "/" and "/thanks"; any other page
  // (footer links such as the legal pages) is on the main site.
  if (host === playbookConfig.host) {
    if (!PLAYBOOK_PATHS.has(pathname)) {
      return NextResponse.redirect(
        new URL(`${pathname}${search}`, siteConfig.url),
        308,
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/playbook" : `/playbook${pathname}`;
    return handleI18nRouting(new NextRequest(url, request));
  }

  // The main domain sends /playbook to the sub-domain (previews keep it).
  if (
    host === siteConfig.domain &&
    (pathname === "/playbook" || pathname.startsWith("/playbook/"))
  ) {
    const rest = pathname.slice("/playbook".length) || "/";
    return NextResponse.redirect(
      new URL(`${rest}${search}`, playbookConfig.url),
      308,
    );
  }

  const applySession = await refreshSession(request);
  return applySession(handleI18nRouting(request));
}

export const config = {
  // Everything except API routes, the /go redirect, the sign-in callback,
  // Next internals and files with an extension (robots.txt, favicon.ico, …).
  matcher: "/((?!api|go/|auth/|_next|_vercel|.*\\..*).*)",
};
