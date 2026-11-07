"use client";

import { ArrowRight, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Starts Stripe Checkout. A plain form post, so it works without
 * JavaScript; with it, the button shows that checkout is opening.
 */
export function BuyButton({
  price,
  refTag = null,
  short = false,
  className,
}: {
  price: string;
  /** Where the visitor came from (?ref=), passed on to Stripe. */
  refTag?: string | null;
  short?: boolean;
  className?: string;
}) {
  const t = useTranslations("Playbook");
  const [pending, setPending] = useState(false);
  return (
    <form
      method="post"
      action="/api/playbook/checkout"
      onSubmit={() => {
        setPending(true);
      }}
      className={className}
    >
      {refTag && <input type="hidden" name="ref" value={refTag} />}
      <Button
        type="submit"
        variant="editorial"
        size="touch"
        disabled={pending}
        className={cn(
          "w-full text-base",
          short ? "h-12 px-5" : "h-14 px-8 sm:w-auto",
        )}
      >
        {pending ? (
          <Loader2
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : short ? (
          <Lock aria-hidden="true" />
        ) : null}
        {pending
          ? t("redirecting")
          : short
            ? t("buyShort", { price })
            : t("buy", { price })}
        {!pending && !short && <ArrowRight aria-hidden="true" />}
      </Button>
    </form>
  );
}
