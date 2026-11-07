"use client";

import { useTranslations } from "next-intl";

import { PageError } from "@/components/page-error";

/** Shown when the platform fails to load; "Try again" re-renders it. */
export default function ErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("PlatformPage");
  return <PageError {...props} title={t("errorTitle")} />;
}
