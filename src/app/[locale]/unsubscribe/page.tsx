import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { AccountNav } from "@/components/account-nav";
import { EmailPrefsForm } from "@/components/email-prefs-form";
import { SiteHeader } from "@/components/site-header";
import { updateEmailPrefsByToken } from "@/lib/email/actions";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("EmailSettings");
  return { title: t("metaTitle"), robots: { index: false } };
}

const tokenSchema = z.string().regex(/^[a-z0-9]{32}$/);

/**
 * Where the "Unsubscribe" link in every email lands. The token from the
 * email identifies the person, so no sign-in is needed.
 */
export default async function UnsubscribePage({
  searchParams,
}: PageProps<"/[locale]/unsubscribe">) {
  const params = await searchParams;
  const token = tokenSchema.safeParse(params.token);
  const t = await getTranslations("EmailSettings");

  const prefs = token.success
    ? (
        await createSupabaseAnonClient().rpc("email_prefs_by_token", {
          p_token: token.data,
        })
      ).data?.[0]
    : undefined;

  return (
    <>
      <SiteHeader>
        <AccountNav />
      </SiteHeader>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        {token.success && prefs ? (
          <>
            <p className="mt-2 text-muted-foreground">{t("byLinkSubtitle")}</p>
            <div className="mt-8">
              <EmailPrefsForm
                initial={prefs}
                save={updateEmailPrefsByToken.bind(null, token.data)}
              />
            </div>
          </>
        ) : (
          <p role="alert" className="mt-4 text-muted-foreground">
            {t("badLink")}
          </p>
        )}
      </main>
    </>
  );
}
