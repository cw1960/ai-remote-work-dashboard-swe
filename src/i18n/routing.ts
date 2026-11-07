import { defineRouting } from "next-intl/routing";

/**
 * Supported locales. English only for now; adding Spanish means adding "es"
 * here and a messages/es.json with the same keys.
 */
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  // The default locale has no URL prefix ("/"), others do ("/es").
  localePrefix: "as-needed",
});
