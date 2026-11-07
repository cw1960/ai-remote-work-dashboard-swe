import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  // Deploy previews must not be indexed; Netlify sets CONTEXT=production only
  // for production deploys.
  const isProduction = process.env.CONTEXT
    ? process.env.CONTEXT === "production"
    : process.env.NODE_ENV === "production";

  return {
    ...(isProduction
      ? { sitemap: new URL("/sitemap.xml", getSiteUrl()).toString() }
      : {}),
    rules: isProduction
      ? // /go/ logs "Apply" clicks, so crawlers must not follow it.
        { userAgent: "*", allow: "/", disallow: "/go/" }
      : { userAgent: "*", disallow: "/" },
  };
}
