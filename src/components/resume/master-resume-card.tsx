"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

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
import { useRouter } from "@/i18n/navigation";
import { deleteMasterResume, uploadMasterResume } from "@/lib/resume/actions";
import { formatDay } from "@/lib/resume/format";

export interface MasterResumeView {
  fileName: string;
  fileType: "pdf" | "docx" | "text";
  updatedAt: string;
}

const MAX_MB = 4;

/**
 * Upload, replace or delete the master resume. An upload fills in the
 * Master Profile's resume text (and keeps its evidence). With `next` (from
 * the job page's Tailor button), a successful upload goes back there.
 */
export function MasterResumeCard({
  master,
  next,
}: {
  master: MasterResumeView | null;
  next: string | null;
}) {
  const t = useTranslations("Resume");
  const locale = useLocale();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  function upload(file: File) {
    setMessage(null);
    // Checked again on the server; this just answers faster.
    if (file.size > MAX_MB * 1024 * 1024) {
      setMessage({ tone: "error", text: t("errors.size", { mb: MAX_MB }) });
      return;
    }
    const data = new FormData();
    data.set("resume", file);
    startTransition(async () => {
      const result = await uploadMasterResume(data);
      if (input.current) input.current.value = "";
      if (!result.ok) {
        setMessage({
          tone: "error",
          text: t(`errors.${result.error}`, { mb: MAX_MB }),
        });
        return;
      }
      if (next) {
        router.push(next);
        return;
      }
      setMessage({ tone: "success", text: t("uploaded") });
      router.refresh();
    });
  }

  function remove() {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMasterResume();
      if (!result.ok) {
        setMessage({ tone: "error", text: t("errors.failed") });
        return;
      }
      setMessage({ tone: "success", text: t("deleted") });
      router.refresh();
    });
  }

  const picker = (
    <>
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        aria-label={master ? t("replace") : t("upload")}
        tabIndex={-1}
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <Button
        type="button"
        variant={master ? "editorialOutline" : "editorial"}
        size="touch"
        disabled={pending}
        aria-describedby="resume-file-help"
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden="true" />
        {pending ? t("uploading") : master ? t("replace") : t("upload")}
      </Button>
    </>
  );

  return (
    <div className="rounded-2xl border border-border p-5 glass-panel">
      {master ? (
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">
              {t("activeLabel")}
            </p>
            <p className="truncate font-bold" data-testid="master-file-name">
              {master.fileName}
            </p>
            <p className="text-sm text-muted-foreground">
              {master.fileType === "text"
                ? t("updatedText", {
                    date: formatDay(master.updatedAt, locale),
                  })
                : t("updated", {
                    type: master.fileType.toUpperCase(),
                    date: formatDay(master.updatedAt, locale),
                  })}
            </p>
          </div>
        </div>
      ) : (
        <div>
          <p className="font-bold">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
      )}

      <p id="resume-file-help" className="mt-4 text-xs text-muted-foreground">
        {t("fileHelp", { mb: MAX_MB })}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {picker}
        {master && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="touch"
                disabled={pending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 aria-hidden="true" />
                {t("delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-popover">
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteBody")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="min-h-11">
                  {t("keep")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={remove}
                >
                  {t("confirmDelete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <p
        role={message?.tone === "error" ? "alert" : "status"}
        className={
          message?.tone === "error"
            ? "mt-3 text-sm text-destructive"
            : "mt-3 text-sm text-foreground/85"
        }
      >
        {message?.text}
      </p>
    </div>
  );
}
