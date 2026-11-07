import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Apply" always goes out through /go/<job> (click log + referral code). A
 * plain <a>, not <Link>: it must never be prefetched, and it leaves the site.
 */
export function ApplyButton({
  jobId,
  platform,
  long,
  className,
}: {
  jobId: string;
  platform: string;
  /** "Apply on Mercor" instead of "Apply". */
  long?: boolean;
  className?: string;
}) {
  const t = useTranslations("Job");
  return (
    <Button
      asChild
      variant="editorial"
      size="touch"
      className={cn("min-w-0", className)}
    >
      <a href={`/go/${jobId}`} target="_blank" rel="noopener nofollow">
        <span className="truncate">
          {long ? t("applyOn", { platform }) : t("apply")}
        </span>
        <ExternalLink aria-hidden="true" />
        <span className="sr-only">{t("opensInNewTab", { platform })}</span>
      </a>
    </Button>
  );
}

/** The affiliate disclosure, shown with Apply on referral platforms. */
export function ReferralDisclosure({ className }: { className?: string }) {
  const t = useTranslations("Job");
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {t("disclosure")}
    </p>
  );
}
