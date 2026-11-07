import { hasLocale, type Messages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";

import { routing } from "./routing";

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  // An explicit locale (e.g. getTranslations({ locale })) wins; otherwise use
  // the [locale] root segment. Unknown values fall back to the default.
  const requested = explicitLocale ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Messages;
  };

  return { locale, messages: messages.default };
});
