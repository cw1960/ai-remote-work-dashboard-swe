import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/config/site";
import { routing } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/env";

import "../globals.css";

// Self-hosted at build time by next/font (no request to Google at runtime).
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "Metadata",
  });

  return {
    metadataBase: getSiteUrl(),
    title: {
      default: t("title", { appName: siteConfig.name }),
      template: `%s · ${siteConfig.name}`,
    },
    description: t("description"),
    applicationName: siteConfig.name,
    openGraph: { type: "website", siteName: siteConfig.name, locale },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches --background (oklch(0.16 0.015 275)); the design is dark-only.
  themeColor: "#0b0d14",
  colorScheme: "dark",
};

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations("Layout");

  return (
    <html lang={locale} className={plusJakarta.variable}>
      <body className="flex min-h-dvh flex-col page-backdrop">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          {children}
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
