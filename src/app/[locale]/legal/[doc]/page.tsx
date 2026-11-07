import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/config/site";
import { isLegalDoc, LEGAL_DOCS } from "@/lib/legal";

/** Values the legal texts refer to, all from the brand config. */
const values = {
  name: siteConfig.name,
  operator: siteConfig.operator.name,
  location: `${siteConfig.operator.city}, ${siteConfig.operator.region}, ${siteConfig.operator.country}`,
  region: siteConfig.operator.region,
  email: siteConfig.supportEmail,
  newsletter: siteConfig.newsletter.name,
  newsletterDomain: siteConfig.newsletter.domain,
};

export function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDoc(doc)) return {};
  const t = await getTranslations("Legal");
  return { title: t(`docs.${doc}.metaTitle`) };
}

/** Terms of Use, Privacy Notice, Cookie Notice and Affiliate Disclosure. */
export default async function LegalPage({
  params,
}: PageProps<"/[locale]/legal/[doc]">) {
  const { doc } = await params;
  if (!isLegalDoc(doc)) notFound();
  const [legal, locale] = await Promise.all([
    getTranslations("Legal"),
    getLocale(),
  ]);
  // Section keys differ per document, so look them up by string.
  const t = legal as unknown as {
    (key: string, values?: Record<string, string>): string;
    raw: (key: string) => unknown;
  };
  const sections = Object.keys(
    t.raw(`docs.${doc}.sections`) as Record<string, unknown>,
  );
  const updated = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${siteConfig.legalUpdated}T00:00:00Z`));

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          {t(`docs.${doc}.title`)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("updated", { date: updated })}
        </p>
        <p className="mt-6 text-lg">{t(`docs.${doc}.intro`, values)}</p>
        {sections.map((key) => (
          <section
            key={key}
            aria-labelledby={`section-${key}`}
            className="mt-8"
          >
            <h2 id={`section-${key}`} className="text-xl font-extrabold">
              {t(`docs.${doc}.sections.${key}.heading`)}
            </h2>
            {t(`docs.${doc}.sections.${key}.body`, values)
              .split("\n\n")
              .map((paragraph, index) => (
                <p
                  key={index}
                  className="mt-3 leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
          </section>
        ))}
        <p className="mt-10 border-t border-border pt-6 text-sm">
          {t("contactLine", values)}
        </p>
      </main>
    </>
  );
}
