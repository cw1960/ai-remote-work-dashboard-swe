import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";

const STEPS = [
  "browse",
  "account",
  "track",
  "tailor",
  "board",
  "remind",
  "alerts",
  "free",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HowItWorks");
  return {
    title: t("metaTitle"),
    description: t("metaDescription", { name: siteConfig.name }),
  };
}

/** A plain walkthrough of the site for new visitors. */
export default async function HowItWorksPage() {
  const [t, user] = await Promise.all([
    getTranslations("HowItWorks"),
    getSessionUser(),
  ]);
  const name = siteConfig.name;

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          {t("title", { name })}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {t("intro", { name })}
        </p>
        <ol className="mt-8 grid gap-4">
          {STEPS.map((step) => (
            <li
              key={step}
              className="rounded-2xl border border-border p-5 glass-panel"
            >
              <h2 className="text-lg font-extrabold">
                {t(`steps.${step}.title`)}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {t(`steps.${step}.body`, { name })}
              </p>
            </li>
          ))}
        </ol>
        <section
          aria-labelledby="cta-title"
          className="mt-10 rounded-2xl border border-primary/25 bg-primary/10 p-6"
        >
          <h2 id="cta-title" className="text-xl font-extrabold">
            {t("ctaTitle")}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {!user && (
              <Button asChild variant="editorial" size="touch">
                <Link href="/sign-in">{t("ctaSignUp")}</Link>
              </Button>
            )}
            <Button
              asChild
              variant={user ? "editorial" : "editorialOutline"}
              size="touch"
            >
              <Link href="/">{t("ctaBrowse")}</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
