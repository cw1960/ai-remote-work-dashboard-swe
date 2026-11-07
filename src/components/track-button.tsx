"use client";

import { Check, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { trackJob, trackPlatform } from "@/lib/tracker/actions";
import { cn } from "@/lib/utils";

export type TrackTarget =
  { kind: "job"; id: string } | { kind: "platform"; slug: string };

/**
 * "Track this": adds a job (or a platform's onboarding) to Saved on the
 * user's board. Signed out, it leads to sign-in and back with `?track=1`,
 * where `autoTrack` finishes the job. Once tracked, it links to the board.
 */
export function TrackButton({
  target,
  tracked: initiallyTracked,
  signInHref,
  autoTrack = false,
  className,
}: {
  target: TrackTarget;
  /** null when signed out. */
  tracked: boolean | null;
  signInHref: string;
  autoTrack?: boolean;
  className?: string;
}) {
  const t = useTranslations("Track");
  const [tracked, setTracked] = useState(initiallyTracked === true);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = target.kind === "job" ? t("trackThis") : t("trackOnboarding");

  function track() {
    setFailed(false);
    startTransition(async () => {
      const result =
        target.kind === "job"
          ? await trackJob({ jobId: target.id })
          : await trackPlatform({ slug: target.slug });
      if (result.ok) setTracked(true);
      else setFailed(true);
    });
  }

  // Back from sign-in with ?track=1: finish what the visitor asked for.
  const autoTracked = useRef(false);
  useEffect(() => {
    if (!autoTrack || initiallyTracked !== false || autoTracked.current) return;
    autoTracked.current = true;
    track();
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classes = cn("min-w-0", className);

  if (initiallyTracked === null) {
    return (
      <Button
        asChild
        variant="editorialOutline"
        size="touch"
        className={classes}
      >
        <Link href={signInHref}>
          <Plus aria-hidden="true" />
          <span className="truncate">{label}</span>
        </Link>
      </Button>
    );
  }

  if (tracked) {
    return (
      <Button
        asChild
        variant="editorialSelected"
        size="touch"
        className={classes}
      >
        <Link href="/dashboard" aria-label={t("trackedLabel")}>
          <Check aria-hidden="true" />
          <span className="truncate">{t("tracked")}</span>
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="editorialOutline"
        size="touch"
        className={classes}
        disabled={pending}
        onClick={track}
      >
        <Plus aria-hidden="true" />
        <span className="truncate">{pending ? t("tracking") : label}</span>
      </Button>
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          {t("failed")}
        </p>
      )}
    </>
  );
}
