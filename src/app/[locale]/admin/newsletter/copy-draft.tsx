"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Copies one social draft, for pasting into LinkedIn, X or Reddit. */
export function CopyDraft({
  text,
  channel,
  textId,
}: {
  text: string;
  /** The channel's name, e.g. "LinkedIn". */
  channel: string;
  /** Id of the element showing the draft. */
  textId: string;
}) {
  const t = useTranslations("Admin.newsletter.run");
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="editorialOutline"
        size="touch"
        aria-label={t("copyLabel", { channel })}
        aria-describedby={textId}
        onClick={() => {
          navigator.clipboard.writeText(text).then(
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
  );
}
