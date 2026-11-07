"use client";

import { FileText, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SubmitEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { getPublicEnv } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

import { LIMITS } from "../../../supabase/functions/_shared/resume/schema";

/** Error codes the tailor-resume function answers with. */
const KNOWN_ERRORS = [
  "description_too_short",
  "description_too_long",
  "not_authenticated",
  "no_master_resume",
  "job_not_found",
  "generation_in_progress",
  "daily_limit",
  "not_configured",
  "refused",
  "truncated",
  "invalid_output",
  "incomplete",
  "rate_limited",
  "timeout",
  "unavailable",
] as const;
type KnownError = (typeof KNOWN_ERRORS)[number] | "failed" | "network";

function asKnownError(value: unknown): KnownError {
  return KNOWN_ERRORS.find((code) => code === value) ?? "failed";
}

/**
 * The job's full description, when the site has it or can read it from the
 * job's page (job-description function); null means the user pastes it.
 */
async function requestDescription(jobId: string): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  const env = getPublicEnv();
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/job-description`,
      {
        method: "POST",
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId }),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      description?: unknown;
    } | null;
    return typeof body?.description === "string" ? body.description : null;
  } catch {
    return null;
  }
}

/** Filling in the description: not started, loading, done, or not found. */
type DescriptionState = "idle" | "loading" | "filled" | "manual";

async function requestTailoring(
  jobId: string,
  jobDescription: string,
): Promise<{ ok: true; id: string } | { ok: false; error: KnownError }> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "not_authenticated" };
  const env = getPublicEnv();
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tailor-resume`,
      {
        method: "POST",
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId, jobDescription }),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      id?: unknown;
      error?: unknown;
    } | null;
    if (response.ok && typeof body?.id === "string") {
      return { ok: true, id: body.id };
    }
    return { ok: false, error: asKnownError(body?.error) };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * "Tailor My Resume for This Job": asks for the job's full description
 * (filled in automatically when the site has it, otherwise pasted), then
 * generates a draft and opens it for review. Without a master resume it
 * explains why one is needed and links to the upload, which comes back here
 * with ?tailor=1.
 */
export function TailorButton({
  jobId,
  jobTitle,
  company,
  hasMaster,
  listingHref,
  autoOpen,
  remaining,
}: {
  jobId: string;
  jobTitle: string;
  company: string;
  hasMaster: boolean;
  /** The job's listing, through /go, to copy the description from. */
  listingHref: string;
  /** Open straight away (back from uploading a resume). */
  autoOpen: boolean;
  /** Generations left today. */
  remaining: number;
}) {
  const t = useTranslations("Tailor");
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [description, setDescription] = useState("");
  const [descriptionState, setDescriptionState] = useState<DescriptionState>(
    autoOpen && hasMaster ? "loading" : "idle",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<KnownError | null>(null);
  // Guards against double submits between the click and the re-render.
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (descriptionState !== "loading") return;
    let active = true;
    void requestDescription(jobId).then((text) => {
      if (!active) return;
      if (text) {
        // Never overwrite what the user already typed or pasted.
        setDescription((current) => (current.trim() === "" ? text : current));
        setDescriptionState("filled");
      } else {
        setDescriptionState("manual");
      }
    });
    return () => {
      active = false;
    };
  }, [descriptionState, jobId]);

  const loadingDescription = descriptionState === "loading";

  const length = description.trim().length;
  const tooShort = length < LIMITS.descriptionMin;
  const backHere = `/jobs/${jobId}?tailor=1`;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || tooShort) return;
    void generate();
  }

  async function generate() {
    inFlight.current = true;
    setPending(true);
    setError(null);
    const result = await requestTailoring(jobId, description);
    if (result.ok) {
      router.push(`/resume/${result.id}`);
      return;
    }
    inFlight.current = false;
    setPending(false);
    setError(result.error);
  }

  return (
    <>
      <Button
        type="button"
        variant="editorial"
        size="touch"
        className="w-full sm:w-auto"
        onClick={() => {
          setOpen(true);
          if (hasMaster && descriptionState === "idle") {
            setDescriptionState("loading");
          }
        }}
      >
        <Sparkles aria-hidden="true" />
        {t("button")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Keep the dialog open while generating, so the work isn't lost.
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-border bg-popover sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("forJob", { title: jobTitle, company })}
            </DialogDescription>
          </DialogHeader>

          {!hasMaster ? (
            <div className="grid gap-4">
              <p className="text-sm">{t("needsMaster")}</p>
              <DialogFooter className="gap-2">
                <Button asChild variant="editorial" size="touch">
                  <Link href={`/resume?next=${encodeURIComponent(backHere)}`}>
                    <FileText aria-hidden="true" />
                    {t("uploadFirst")}
                  </Link>
                </Button>
              </DialogFooter>
            </div>
          ) : pending ? (
            <div role="status" aria-live="polite" className="grid gap-3 py-4">
              <p className="flex items-center gap-2 font-semibold">
                <Loader2
                  className="size-5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {t("generating", { title: jobTitle, company })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("generatingHint")}
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <label htmlFor="job-description" className="text-sm font-bold">
                  {t("descriptionLabel")}
                </label>
                <p
                  id="job-description-help"
                  className="text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  {loadingDescription ? (
                    <span className="flex items-center gap-2">
                      <Loader2
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      {t("descriptionLoading")}
                    </span>
                  ) : (
                    t.rich(
                      descriptionState === "filled"
                        ? "descriptionFilled"
                        : "descriptionHelp",
                      {
                        listing: (chunks) => (
                          <a
                            href={listingHref}
                            target="_blank"
                            rel="noopener"
                            className="font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            {chunks}
                          </a>
                        ),
                      },
                    )
                  )}
                </p>
                <Textarea
                  id="job-description"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                  }}
                  maxLength={LIMITS.descriptionMax}
                  rows={8}
                  required
                  disabled={loadingDescription}
                  aria-describedby="job-description-help job-description-count"
                  className="min-h-40 rounded-xl bg-card text-base"
                />
                <p
                  id="job-description-count"
                  className="text-xs text-muted-foreground"
                >
                  {tooShort
                    ? t("tooShort", { count: LIMITS.descriptionMin - length })
                    : t("length", { count: length })}
                </p>
              </div>

              {error && (
                <p
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm"
                >
                  {t(`errors.${error}`)}
                  {error === "no_master_resume" && (
                    <>
                      {" "}
                      <Link
                        href={`/resume?next=${encodeURIComponent(backHere)}`}
                        className="font-semibold underline"
                      >
                        {t("uploadFirst")}
                      </Link>
                    </>
                  )}
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                {t("remaining", { count: remaining })} {t("privacy")}
              </p>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="editorialOutline"
                  size="touch"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="editorial"
                  size="touch"
                  disabled={tooShort || loadingDescription || remaining <= 0}
                >
                  <Sparkles aria-hidden="true" />
                  {t("generate")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
