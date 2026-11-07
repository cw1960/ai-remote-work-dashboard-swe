import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FeedView } from "@/components/jobs/feed-view";
import { redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Feed");
  // The public feed at "/" is the page to index; this one is for members.
  return { title: t("allTitle"), robots: { index: false } };
}

/** All open jobs with filters, inside the app for signed-in users. */
export default async function AllJobsPage({
  searchParams,
}: PageProps<"/[locale]/jobs">) {
  const [locale, user, params] = await Promise.all([
    getLocale(),
    getSessionUser(),
    searchParams,
  ]);
  if (!user) {
    redirect({ href: "/sign-in?next=%2Fjobs", locale });
    return null;
  }
  return <FeedView params={params} basePath="/jobs" />;
}
