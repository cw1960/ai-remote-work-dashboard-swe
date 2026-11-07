"use client";

import { ArrowRight, BookOpen, X } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatPlaybookPrice } from "@/lib/playbook/price";
import {
  PLAYBOOK_CARD_COOKIE,
  type PlaybookRef,
  playbookUrl,
} from "@/lib/playbook/promo";
import { cn } from "@/lib/utils";

import cover from "../../../public/playbook/cover.webp";

/**
 * One line pointing to the Playbook where it helps (a tracker stage, a
 * micro1 job, the evidence field). Subtle by design: text, not a banner.
 */
export function PlaybookTip({
  message,
  refTag,
  className,
}: {
  message: string;
  refTag: PlaybookRef;
  className?: string;
}) {
  const t = useTranslations("PlaybookPromo");
  return (
    <p className={cn("flex gap-2 text-xs text-muted-foreground", className)}>
      <BookOpen
        className="mt-0.5 size-3.5 shrink-0 text-primary"
        aria-hidden="true"
      />
      <span>
        {message}{" "}
        <a
          href={playbookUrl(refTag)}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("seeIt")}
        </a>
      </span>
    </p>
  );
}

/**
 * The Playbook card: the cover, one line and the price. On the dashboard it
 * can be hidden for good (a cookie the page checks).
 */
export function PlaybookCard({
  refTag,
  dismissible = false,
  className,
}: {
  refTag: PlaybookRef;
  dismissible?: boolean;
  className?: string;
}) {
  const t = useTranslations("PlaybookPromo");
  const locale = useLocale();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <aside
      aria-labelledby={`playbook-${refTag}`}
      className={cn(
        "relative flex items-center gap-4 rounded-2xl border border-border p-4 glass-panel sm:gap-5 sm:p-5",
        className,
      )}
    >
      <Image
        src={cover}
        alt=""
        sizes="72px"
        className="h-auto w-16 shrink-0 rounded-md shadow-lg shadow-black/40 sm:w-[4.5rem]"
      />
      <div className="min-w-0 flex-1 pr-8">
        <p className="text-xs font-bold text-primary uppercase">
          {t("eyebrow")}
        </p>
        <h2 id={`playbook-${refTag}`} className="mt-1 font-bold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("body")}</p>
        <a
          href={playbookUrl(refTag)}
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("cta", { price: formatPlaybookPrice(locale) })}
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      </div>
      {dismissible && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-11"
          aria-label={t("dismiss")}
          onClick={() => {
            document.cookie = `${PLAYBOOK_CARD_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
            setHidden(true);
          }}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </aside>
  );
}
