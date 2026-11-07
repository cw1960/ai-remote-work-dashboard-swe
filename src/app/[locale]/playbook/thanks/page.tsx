import { CircleAlert, Download, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

import { Button } from "@/components/ui/button";
import { playbookConfig } from "@/config/playbook";
import { siteConfig } from "@/config/site";
import { playbookPath } from "@/lib/playbook/paths";
import { checkPurchase } from "@/lib/playbook/stripe";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Playbook.thanks");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * After checkout: confirms the purchase with Stripe and offers the
 * download, then the first step of the book's plan (the free dashboard).
 */
export default async function PlaybookThanksPage({
  searchParams,
}: PageProps<"/[locale]/playbook/thanks">) {
  const [t, query, requestHeaders] = await Promise.all([
    getTranslations("Playbook.thanks"),
    searchParams,
    headers(),
  ]);
  const sessionId =
    typeof query.session_id === "string" ? query.session_id : "";
  const support = siteConfig.supportEmail;
  const days = playbookConfig.downloadDays;

  const { status, email } = await checkPurchase(sessionId);
  const back = playbookPath(requestHeaders.get("host"));

  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
      {status === "paid" ? (
        <>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {email ? t("body", { email, days }) : t("bodyNoEmail", { days })}
          </p>
          <Button
            asChild
            variant="editorial"
            size="touch"
            className="mt-6 h-14 w-full px-8 text-base sm:w-auto"
          >
            <a
              href={`/api/playbook/download?session_id=${encodeURIComponent(sessionId)}`}
            >
              <Download aria-hidden="true" />
              {t("download")}
            </a>
          </Button>

          <section
            aria-labelledby="next-title"
            className="mt-10 rounded-2xl border border-primary/30 p-6 glass-panel"
          >
            <h2
              id="next-title"
              className="flex items-center gap-2 font-display text-xl font-extrabold"
            >
              <LayoutDashboard
                className="size-5 text-primary"
                aria-hidden="true"
              />
              {t("nextTitle")}
            </h2>
            <p className="mt-2 text-muted-foreground">{t("nextBody")}</p>
            <Button
              asChild
              variant="editorialOutline"
              size="touch"
              className="mt-4"
            >
              <a href={`${siteConfig.url}/sign-in`}>{t("nextCta")}</a>
            </Button>
          </section>
          <p className="mt-6 text-sm text-muted-foreground">
            {t("support", {
              email: support,
              days: playbookConfig.refundDays,
            })}
          </p>
        </>
      ) : (
        <div
          role="alert"
          className="rounded-2xl border border-border p-6 glass-panel"
        >
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <CircleAlert className="size-6 text-primary" aria-hidden="true" />
            {t(`${status}Title`)}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {t(`${status}Body`, { email: support, days })}
          </p>
          <a
            href={back}
            className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
          >
            {t("back")}
          </a>
        </div>
      )}
    </main>
  );
}
