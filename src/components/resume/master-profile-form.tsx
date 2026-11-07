"use client";

import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SubmitEvent, useRef, useState, useTransition } from "react";

import { PlaybookTip } from "@/components/playbook/promo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { saveMasterProfile } from "@/lib/resume/actions";

import { LIMITS } from "../../../supabase/functions/_shared/resume/schema";

/**
 * The Master Profile editor: the resume text (filled in by an upload, or
 * pasted) and the core skills and evidence. Saving stores both as a new
 * master resume version. With `next` (from a job's Tailor button), a save
 * goes back there.
 */
export function MasterProfileForm({
  content,
  evidence,
  next,
}: {
  content: string;
  evidence: string;
  next: string | null;
}) {
  const t = useTranslations("Resume");
  const tPromo = useTranslations("PlaybookPromo");
  const router = useRouter();
  const [resumeText, setResumeText] = useState(content);
  const [evidenceText, setEvidenceText] = useState(evidence);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  function show(tone: "error" | "success", text: string) {
    setMessage({ tone, text });
    // After the re-render, so screen readers and keyboards land on it.
    requestAnimationFrame(() => messageRef.current?.focus());
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveMasterProfile({
        content: resumeText,
        evidence: evidenceText,
      });
      if (!result.ok) {
        show(
          "error",
          t(`profileErrors.${result.error}`, {
            min: LIMITS.masterMin,
            max:
              result.error === "evidence_too_long"
                ? LIMITS.evidenceMax
                : LIMITS.masterMax,
          }),
        );
        return;
      }
      if (next) {
        router.push(next);
        return;
      }
      show("success", result.changed ? t("saved") : t("unchanged"));
      router.refresh();
    });
  }

  const resumeLength = resumeText.trim().length;
  const evidenceLength = evidenceText.trim().length;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-6 rounded-2xl border border-border p-5 glass-panel sm:p-6"
    >
      <div className="grid gap-2">
        <label htmlFor="master-resume-text" className="text-lg font-extrabold">
          {t("resumeLabel")}
        </label>
        <p id="master-resume-help" className="text-sm text-muted-foreground">
          {t("resumeHelp")}
        </p>
        <Textarea
          id="master-resume-text"
          value={resumeText}
          onChange={(event) => {
            setResumeText(event.target.value);
          }}
          maxLength={LIMITS.masterMax}
          rows={16}
          required
          aria-describedby="master-resume-help master-resume-count"
          className="min-h-80 rounded-xl bg-card font-mono text-sm leading-relaxed"
        />
        <p id="master-resume-count" className="text-xs text-muted-foreground">
          {t("count", { count: resumeLength, max: LIMITS.masterMax })}
        </p>
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="master-evidence-text"
          className="text-lg font-extrabold"
        >
          {t("evidenceLabel")}
        </label>
        <p id="master-evidence-help" className="text-sm text-muted-foreground">
          {t("evidenceHelp")}
        </p>
        <PlaybookTip message={tPromo("evidence")} refTag="master-profile" />
        <Textarea
          id="master-evidence-text"
          value={evidenceText}
          onChange={(event) => {
            setEvidenceText(event.target.value);
          }}
          maxLength={LIMITS.evidenceMax}
          rows={10}
          placeholder={t("evidencePlaceholder")}
          aria-describedby="master-evidence-help master-evidence-count"
          className="min-h-56 rounded-xl bg-card text-base"
        />
        <p id="master-evidence-count" className="text-xs text-muted-foreground">
          {t("count", { count: evidenceLength, max: LIMITS.evidenceMax })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="editorial"
          size="touch"
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {pending ? (
            <Loader2
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Save aria-hidden="true" />
          )}
          {pending ? t("saving") : t("save")}
        </Button>
      </div>

      <p
        ref={messageRef}
        tabIndex={-1}
        role={message?.tone === "error" ? "alert" : "status"}
        className={
          message
            ? message.tone === "error"
              ? "rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm"
              : "rounded-xl border border-success/35 bg-success/10 p-3 text-sm"
            : "sr-only"
        }
      >
        {message?.text}
      </p>
    </form>
  );
}
