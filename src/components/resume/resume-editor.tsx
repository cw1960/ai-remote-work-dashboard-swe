"use client";

import { Download, Save, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteTailoredResume, saveTailoredResume } from "@/lib/resume/actions";

import {
  cleanResume,
  type Resume,
} from "../../../supabase/functions/_shared/resume/schema";

const FIELD = "min-h-11 rounded-xl bg-card text-base";
const AREA = "rounded-xl bg-card text-base";

function toLines(items: string[]): string {
  return items.join("\n");
}

function fromLines(text: string): string[] {
  return text.split("\n");
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          rows={rows}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={AREA}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <Input
          id={id}
          value={value}
          className={FIELD}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </div>
  );
}

/** The file name from a Content-Disposition header, or a fallback. */
function fileNameFrom(header: string | null, fallback: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header ?? "")?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * The review screen's editor: every part of the tailored resume is
 * editable. Nothing is final until "Save Tailored Resume"; the master
 * resume is never changed from here.
 */
export function ResumeEditor({
  id,
  jobId,
  status,
  initial,
}: {
  id: string;
  jobId: string;
  status: "draft" | "saved";
  initial: Resume;
}) {
  const t = useTranslations("Review");
  const router = useRouter();
  const [resume, setResume] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);

  function update(change: (draft: Resume) => Resume) {
    setResume((current) => change(current));
    setDirty(true);
    setMessage(null);
  }

  async function persist(final: boolean): Promise<boolean> {
    const result = await saveTailoredResume({
      id,
      content: cleanResume(resume),
      final,
    });
    if (!result.ok) {
      setMessage({
        tone: "error",
        text: result.error === "invalid" ? t("invalid") : t("saveFailed"),
      });
      return false;
    }
    setDirty(false);
    return true;
  }

  function save() {
    startTransition(async () => {
      if (await persist(true)) {
        setMessage({ tone: "success", text: t("saved") });
        router.refresh();
      }
    });
  }

  function download(format: "docx" | "pdf") {
    startTransition(async () => {
      // Edits are kept (as they are, without approving them) before downloading.
      if (dirty && !(await persist(status === "saved"))) return;
      const response = await fetch(
        `/api/resumes/${id}/download?format=${format}`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage({
          tone: "error",
          text:
            body?.error === "unsupported_characters"
              ? t("pdfUnsupported")
              : t("downloadFailed"),
        });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(
        response.headers.get("Content-Disposition"),
        `resume.${format}`,
      );
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ tone: "success", text: t("downloaded") });
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await deleteTailoredResume({ id });
      if (!result.ok) {
        setMessage({ tone: "error", text: t("saveFailed") });
        return;
      }
      setDirty(false);
      router.push(`/jobs/${jobId}`);
    });
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="editorial"
        size="touch"
        disabled={pending}
        onClick={save}
      >
        <Save aria-hidden="true" />
        {t("save")}
      </Button>
      <Button
        type="button"
        variant="editorialOutline"
        size="touch"
        disabled={pending}
        onClick={() => {
          download("docx");
        }}
      >
        <Download aria-hidden="true" />
        {t("downloadWord")}
      </Button>
      <Button
        type="button"
        variant="editorialOutline"
        size="touch"
        disabled={pending}
        onClick={() => {
          download("pdf");
        }}
      >
        <Download aria-hidden="true" />
        {t("downloadPdf")}
      </Button>
      {status === "draft" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="touch"
              disabled={pending}
            >
              <X aria-hidden="true" />
              {t("cancel")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-popover">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("discardBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="min-h-11">
                {t("keepDraft")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={discard}
              >
                {t("discard")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button asChild variant="ghost" size="touch">
          <Link href={`/jobs/${jobId}`}>
            <X aria-hidden="true" />
            {t("cancel")}
          </Link>
        </Button>
      )}
    </div>
  );

  return (
    <div className="grid gap-6">
      <section aria-labelledby="edit-basics" className="grid gap-4">
        <h2 id="edit-basics" className="text-lg font-extrabold">
          {t("basics")}
        </h2>
        <Field
          label={t("name")}
          value={resume.name}
          onChange={(value) => {
            update((r) => ({ ...r, name: value }));
          }}
        />
        <Field
          label={t("headline")}
          value={resume.headline ?? ""}
          onChange={(value) => {
            update((r) => ({ ...r, headline: value }));
          }}
        />
        <Field
          label={t("contact")}
          hint={t("onePerLine")}
          multiline
          value={toLines(resume.contact)}
          onChange={(value) => {
            update((r) => ({ ...r, contact: fromLines(value) }));
          }}
        />
        <Field
          label={t("summary")}
          multiline
          rows={4}
          value={resume.summary ?? ""}
          onChange={(value) => {
            update((r) => ({ ...r, summary: value }));
          }}
        />
        <Field
          label={t("skills")}
          hint={t("onePerLine")}
          multiline
          rows={5}
          value={toLines(resume.skills)}
          onChange={(value) => {
            update((r) => ({ ...r, skills: fromLines(value) }));
          }}
        />
      </section>

      <section aria-labelledby="edit-experience" className="grid gap-4">
        <h2 id="edit-experience" className="text-lg font-extrabold">
          {t("experience")}
        </h2>
        {resume.experience.map((job, index) => (
          <fieldset
            key={index}
            className="grid gap-3 rounded-2xl border border-border p-4 glass-panel"
          >
            <legend className="px-1 text-sm font-bold">
              {job.title || t("position")}
              {job.employer ? `, ${job.employer}` : ""}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("jobTitle")}
                value={job.title}
                onChange={(value) => {
                  update((r) => ({
                    ...r,
                    experience: r.experience.map((item, i) =>
                      i === index ? { ...item, title: value } : item,
                    ),
                  }));
                }}
              />
              <Field
                label={t("employer")}
                value={job.employer}
                onChange={(value) => {
                  update((r) => ({
                    ...r,
                    experience: r.experience.map((item, i) =>
                      i === index ? { ...item, employer: value } : item,
                    ),
                  }));
                }}
              />
              <Field
                label={t("location")}
                value={job.location ?? ""}
                onChange={(value) => {
                  update((r) => ({
                    ...r,
                    experience: r.experience.map((item, i) =>
                      i === index ? { ...item, location: value } : item,
                    ),
                  }));
                }}
              />
              <Field
                label={t("dates")}
                value={job.dates ?? ""}
                onChange={(value) => {
                  update((r) => ({
                    ...r,
                    experience: r.experience.map((item, i) =>
                      i === index ? { ...item, dates: value } : item,
                    ),
                  }));
                }}
              />
            </div>
            <Field
              label={t("bullets")}
              hint={t("onePerLine")}
              multiline
              rows={5}
              value={toLines(job.bullets)}
              onChange={(value) => {
                update((r) => ({
                  ...r,
                  experience: r.experience.map((item, i) =>
                    i === index ? { ...item, bullets: fromLines(value) } : item,
                  ),
                }));
              }}
            />
            <div>
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  update((r) => ({
                    ...r,
                    experience: r.experience.filter((_, i) => i !== index),
                  }));
                }}
              >
                <Trash2 aria-hidden="true" />
                {t("removePosition")}
              </Button>
            </div>
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="edit-education" className="grid gap-4">
        <h2 id="edit-education" className="text-lg font-extrabold">
          {t("education")}
        </h2>
        {resume.education.map((item, index) => (
          <fieldset
            key={index}
            className="grid gap-3 rounded-2xl border border-border p-4 glass-panel"
          >
            <legend className="px-1 text-sm font-bold">
              {item.credential || t("educationEntry")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("credential")}
                value={item.credential}
                onChange={(value) => {
                  update((r) => ({
                    ...r,
                    education: r.education.map((entry, i) =>
                      i === index ? { ...entry, credential: value } : entry,
                    ),
                  }));
                }}
              />
              <Field
                label={t("institution")}
                value={item.institution}
                onChange={(value) => {
                  update((r) => ({
                    ...r,
                    education: r.education.map((entry, i) =>
                      i === index ? { ...entry, institution: value } : entry,
                    ),
                  }));
                }}
              />
              <Field
                label={t("dates")}
                value={item.dates ?? ""}
                onChange={(value) => {
                  update((r) => ({
                    ...r,
                    education: r.education.map((entry, i) =>
                      i === index ? { ...entry, dates: value } : entry,
                    ),
                  }));
                }}
              />
            </div>
            <Field
              label={t("details")}
              hint={t("onePerLine")}
              multiline
              value={toLines(item.details)}
              onChange={(value) => {
                update((r) => ({
                  ...r,
                  education: r.education.map((entry, i) =>
                    i === index
                      ? { ...entry, details: fromLines(value) }
                      : entry,
                  ),
                }));
              }}
            />
          </fieldset>
        ))}
      </section>

      <section aria-labelledby="edit-more" className="grid gap-4">
        <h2 id="edit-more" className="text-lg font-extrabold">
          {t("more")}
        </h2>
        <Field
          label={t("certifications")}
          hint={t("onePerLine")}
          multiline
          value={toLines(resume.certifications)}
          onChange={(value) => {
            update((r) => ({ ...r, certifications: fromLines(value) }));
          }}
        />
        {resume.other_sections.map((section, index) => (
          <Field
            key={index}
            label={section.heading}
            hint={t("onePerLine")}
            multiline
            value={toLines(section.items)}
            onChange={(value) => {
              update((r) => ({
                ...r,
                other_sections: r.other_sections.map((entry, i) =>
                  i === index ? { ...entry, items: fromLines(value) } : entry,
                ),
              }));
            }}
          />
        ))}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-border bg-background/90 p-4 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
        {actions}
        <p
          role={message?.tone === "error" ? "alert" : "status"}
          className={
            message?.tone === "error" ? "text-sm text-destructive" : "text-sm"
          }
        >
          {message?.text ?? (dirty ? t("unsaved") : "")}
        </p>
      </div>
    </div>
  );
}
