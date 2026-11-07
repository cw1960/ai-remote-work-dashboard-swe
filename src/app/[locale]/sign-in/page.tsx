import { Check } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AccountNav } from "@/components/account-nav";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { getSessionUser } from "@/lib/auth/session";

import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Magic-link sign-in. Works without JavaScript (a plain form post). */
export default async function SignInPage({
  searchParams,
}: PageProps<"/[locale]/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : null,
  );
  const [t, user] = await Promise.all([
    getTranslations("Auth"),
    getSessionUser(),
  ]);

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main
        id="main"
        className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:py-16"
      >
        <div className="rounded-2xl border border-border p-6 glass-panel">
          <h1 className="font-display text-2xl font-extrabold">
            {t("title", { appName: siteConfig.name })}
          </h1>
          {user ? (
            <div className="mt-4 grid gap-4">
              <p className="text-sm">
                {t("signedInAs", { email: user.email ?? "" })}
              </p>
              <Button
                asChild
                variant="editorial"
                size="touch"
                className="justify-self-start"
              >
                <Link href={next}>{t("continue")}</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
              <div className="mt-5">
                <SignInForm next={next} linkFailed={params.error === "link"} />
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                {t.rich("consent", {
                  terms: (chunks) => (
                    <Link href="/legal/terms" className="underline">
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link href="/legal/privacy" className="underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-sm font-bold">{t("benefitsTitle")}</p>
                <ul className="mt-2 grid gap-2 text-sm text-muted-foreground">
                  {(["track", "remind", "alerts"] as const).map((key) => (
                    <li key={key} className="flex gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {t(`benefits.${key}`)}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">{t("why")}</p>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
