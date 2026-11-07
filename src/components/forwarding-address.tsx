"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** The user's private forwarding address, with a copy button. */
export function ForwardingAddress({ address }: { address: string }) {
  const t = useTranslations("Inbound");
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <div className="grid gap-2">
      <p
        id="forwarding-address"
        className="rounded-xl border border-border bg-card px-3 py-2.5 font-mono text-sm break-all"
      >
        {address}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="editorialOutline"
          size="touch"
          aria-describedby="forwarding-address"
          onClick={() => {
            navigator.clipboard.writeText(address).then(
              () => {
                setCopied("copied");
              },
              () => {
                setCopied("failed");
              },
            );
          }}
        >
          {copied === "copied" ? (
            <Check aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {t("copy")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {copied === "copied" && t("copied")}
          {copied === "failed" && t("copyFailed")}
        </span>
      </div>
    </div>
  );
}
