"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { SiteHeader } from "@/components/site-header";
import { StateBlock } from "@/components/state-block";
import { Button } from "@/components/ui/button";

/** Body of a route's error.tsx: the error state with "Try again". */
export function PageError({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
}) {
  const t = useTranslations("Feed");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6"
      >
        <StateBlock
          icon={CircleAlert}
          tone="error"
          title={title}
          copy={t("errorBody")}
          action={
            <Button variant="editorial" size="touch" onClick={reset}>
              <RotateCcw />
              {t("retry")}
            </Button>
          }
        />
      </main>
    </>
  );
}
