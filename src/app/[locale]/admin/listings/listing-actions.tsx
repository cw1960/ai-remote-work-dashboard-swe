"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  closeListing,
  type ListingActionResult,
  resolveListing,
} from "@/lib/listings/actions";

/** Keep / drop for a listing under review, or close an open one. */
export function ListingActions({
  id,
  title,
  inReview,
}: {
  id: string;
  title: string;
  inReview: boolean;
}) {
  const t = useTranslations("AdminListings");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ListingActionResult>) {
    setFailed(false);
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false }) as const);
      if (!result.ok) setFailed(true);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {inReview && (
        <>
          <Button
            type="button"
            variant="editorialOutline"
            size="touch"
            disabled={pending}
            aria-label={`${t("keep")}: ${title}`}
            onClick={() => {
              run(() => resolveListing({ id, keep: true }));
            }}
          >
            {t("keep")}
          </Button>
          <Button
            type="button"
            variant="editorialOutline"
            size="touch"
            disabled={pending}
            aria-label={`${t("drop")}: ${title}`}
            onClick={() => {
              run(() => resolveListing({ id, keep: false }));
            }}
          >
            {t("drop")}
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="editorialLink"
        size="touch"
        disabled={pending}
        aria-label={`${t("close")}: ${title}`}
        onClick={() => {
          run(() => closeListing(id));
        }}
      >
        {t("close")}
      </Button>
      <p role="alert" className="text-sm text-destructive">
        {failed ? t("actionFailed") : null}
      </p>
    </div>
  );
}
