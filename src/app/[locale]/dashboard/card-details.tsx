"use client";

import {
  ArrowRight,
  Ban,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileText,
  Lightbulb,
  Mail,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import {
  type CardDetails,
  deleteCard,
  getCardDetails,
  updateCard,
} from "@/lib/tracker/actions";
import {
  addDays,
  dueView,
  formatDay,
  fromDateInput,
  localToday,
  nextMonday,
} from "@/lib/tracker/dates";
import { STAGE_STYLES } from "@/lib/tracker/stage-styles";
import { type Stage, STAGES } from "@/lib/tracker/stages";
import { cn } from "@/lib/utils";

import type { BoardCardView } from "./board";

const KIND_ICONS = {
  job: BriefcaseBusiness,
  platform: Sparkles,
  manual: FileText,
} as const;

/** How long typing pauses before notes are saved. */
const NOTES_DELAY_MS = 700;

export interface CardDetailsProps {
  card: BoardCardView | null;
  onClose: () => void;
  /** Moves the card on the board; resolves to whether the server agreed. */
  onMove: (id: string, stage: Stage) => Promise<boolean>;
  /** Updates the board tile after an edit. */
  onPatch: (id: string, patch: Partial<BoardCardView>) => void;
  onDeleted: (card: BoardCardView) => void;
}

/**
 * The card details sheet: stage, dates, notes, stage history and delete.
 * Every edit saves on its own; the board tile updates as it does.
 */
export function CardDetailsSheet({
  card,
  onClose,
  ...props
}: CardDetailsProps) {
  return (
    <Sheet
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-border bg-popover p-0 sm:max-w-lg"
      >
        {card && <Details key={card.id} card={card} {...props} />}
      </SheetContent>
    </Sheet>
  );
}

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; details: CardDetails };

type SaveState = "idle" | "saving" | "saved" | "error";

interface CardPatch {
  title?: string;
  appliedOn?: string | null;
  nextActionOn?: string | null;
  notes?: string;
}

function Details({
  card,
  onMove,
  onPatch,
  onDeleted,
}: Omit<CardDetailsProps, "card" | "onClose"> & { card: BoardCardView }) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void getCardDetails({ id: card.id }).then(
      (result) => {
        if (!active) return;
        setLoad(
          result.ok
            ? { state: "ready", details: result.details }
            : { state: "error" },
        );
      },
      () => {
        if (active) setLoad({ state: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [card.id, attempt]);

  const Icon = KIND_ICONS[card.kind];

  return (
    <>
      <SheetHeader className="border-b border-border px-4 pt-5 pb-4 text-left sm:px-6">
        <div className="flex flex-wrap items-center gap-2 pr-10">
          <Badge
            variant="outline"
            className="gap-1 border-border bg-secondary text-muted-foreground"
          >
            <Icon className="size-3" aria-hidden="true" />
            {t(`kinds.${card.kind}`)}
          </Badge>
          <Badge
            variant="outline"
            className="gap-1.5 border-border bg-secondary text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                STAGE_STYLES[card.stage].dot,
              )}
            />
            {t(`stages.${card.stage}`)}
          </Badge>
        </div>
        <SheetTitle className="mt-2 text-xl leading-snug font-extrabold break-words">
          {card.title}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 text-sm">
          {card.platformName && <span>{card.platformName}</span>}
          {card.job && (
            <Link
              href={`/jobs/${card.job.id}`}
              className="inline-flex min-h-11 items-center gap-1 rounded font-semibold text-accent-foreground hover:underline"
            >
              {t("details.viewJob")}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </SheetDescription>
      </SheetHeader>

      {load.state === "loading" && (
        <div
          aria-busy="true"
          aria-label={t("details.loading")}
          role="status"
          className="grid gap-4 p-4 sm:p-6"
        >
          <Skeleton className="h-11 rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      )}

      {load.state === "error" && (
        <div className="p-4 sm:p-6">
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span className="flex items-center gap-2">
              <CircleAlert className="size-4" aria-hidden="true" />
              {t("details.loadFailed")}
            </span>
            <Button
              type="button"
              variant="editorialOutline"
              size="touch"
              onClick={() => {
                setLoad({ state: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              <RotateCcw aria-hidden="true" />
              {t("details.tryAgain")}
            </Button>
          </div>
        </div>
      )}

      {load.state === "ready" && (
        <Editor
          card={card}
          initial={load.details}
          locale={locale}
          onMove={onMove}
          onPatch={onPatch}
        />
      )}

      <DeleteFooter card={card} onDeleted={onDeleted} />
    </>
  );
}

function Editor({
  card,
  initial,
  locale,
  onMove,
  onPatch,
}: Pick<CardDetailsProps, "onMove" | "onPatch"> & {
  card: BoardCardView;
  initial: CardDetails;
  locale: string;
}) {
  const t = useTranslations("Dashboard");
  const [details, setDetails] = useState(initial);
  const [title, setTitle] = useState(card.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notesFailed, setNotesFailed] = useState(false);
  const [moveFailed, setMoveFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  /** Notes typed but not yet sent; saved at once if the sheet closes. */
  const pendingNotes = useRef<string | null>(null);
  const cardId = card.id;

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pendingNotes.current !== null) {
        void updateCard({ id: cardId, notes: pendingNotes.current });
      }
    },
    [cardId],
  );

  async function save(patch: CardPatch): Promise<boolean> {
    setSaveState("saving");
    try {
      const result = await updateCard({ id: card.id, ...patch });
      setSaveState(result.ok ? "saved" : "error");
      return result.ok;
    } catch {
      setSaveState("error");
      return false;
    }
  }

  function saveNotes(notes: string) {
    pendingNotes.current = null;
    void save({ notes }).then((ok) => {
      setNotesFailed(!ok);
    });
  }

  function editNotes(notes: string) {
    setDetails((d) => ({ ...d, notes }));
    setSaveState("saving");
    pendingNotes.current = notes;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveNotes(notes);
    }, NOTES_DELAY_MS);
  }

  function setDate(field: "appliedOn" | "nextActionOn", value: string) {
    const before = details[field];
    setDetails((d) => ({ ...d, [field]: value }));
    const patch: CardPatch =
      field === "appliedOn"
        ? { appliedOn: value || null }
        : { nextActionOn: value || null };
    void save(patch).then((ok) => {
      if (!ok) {
        setDetails((d) => ({ ...d, [field]: before }));
        return;
      }
      if (field === "nextActionOn") {
        const nextActionAt = fromDateInput(value);
        onPatch(card.id, {
          nextActionAt,
          ...dueView(nextActionAt, locale, Date.now()),
        });
      }
    });
  }

  function saveTitle() {
    const clean = title.trim();
    if (!clean || clean === card.title) {
      setTitle(card.title);
      return;
    }
    void save({ title: clean }).then((ok) => {
      if (ok) onPatch(card.id, { title: clean });
      else setTitle(card.title);
    });
  }

  async function moveTo(stage: Stage) {
    if (stage === card.stage) return;
    const from = card.stage;
    const ok = await onMove(card.id, stage);
    setMoveFailed(!ok);
    if (!ok) return;
    const now = new Date();
    setDetails((d) => ({
      ...d,
      // The first move to Applied sets the applied date (see moveCard).
      appliedOn:
        stage === "applied" && !d.appliedOn
          ? now.toISOString().slice(0, 10)
          : d.appliedOn,
      history: [
        ...d.history,
        { from, to: stage, viaEmail: false, at: now.toISOString() },
      ],
    }));
  }

  const next = STAGES[STAGES.indexOf(card.stage) + 1];
  const playbook = details.playbooks[card.stage];
  const today = localToday(new Date());

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="grid gap-6 p-4 sm:p-6">
        {card.kind === "manual" && (
          <div className="grid gap-2">
            <label htmlFor="card-title" className="text-sm font-bold">
              {t("cardTitle")}
            </label>
            <Input
              id="card-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value.slice(0, 300));
              }}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="min-h-11 rounded-xl bg-card text-base"
            />
          </div>
        )}

        {card.job && (
          <section
            aria-label={t("details.jobStatus")}
            className="grid grid-cols-2 gap-3"
          >
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("details.pay")}
              </p>
              <p className="mt-1 font-bold">
                {card.payLabel ?? t("details.payNotListed")}
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-3",
                card.job.closed
                  ? "border-destructive/30 bg-destructive/10"
                  : "border-border bg-card/60",
              )}
            >
              <p className="text-xs font-semibold text-muted-foreground">
                {t("details.listing")}
              </p>
              <p
                className={cn(
                  "mt-1 flex items-center gap-1 font-bold",
                  card.job.closed && "text-destructive",
                )}
              >
                {card.job.closed ? (
                  <>
                    <Ban className="size-4" aria-hidden="true" />
                    {details.closedAt
                      ? t("details.closedOn", {
                          date: formatDay(details.closedAt, locale),
                        })
                      : t("closed")}
                  </>
                ) : (
                  <>
                    <Check className="size-4" aria-hidden="true" />
                    {t("details.stillOpen")}
                  </>
                )}
              </p>
            </div>
          </section>
        )}

        {card.job && (
          <section
            aria-labelledby="details-resume"
            className="rounded-xl border border-border bg-card/60 p-3"
          >
            <h3
              id="details-resume"
              className="flex items-center gap-1.5 text-sm font-bold"
            >
              <FileText className="size-4" aria-hidden="true" />
              {t("details.resume")}
            </h3>
            {card.tailoredResumeId ? (
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link
                  href={`/resume/${card.tailoredResumeId}`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                >
                  {t("details.resumeView")}
                </Link>
                <a
                  href={`/api/resumes/${card.tailoredResumeId}/download?format=docx`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                >
                  {t("details.resumeDownload")}
                </a>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("details.resumeNone")}{" "}
                <Link
                  href={`/jobs/${card.job.id}#tailor`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                >
                  {t("details.resumeTailor")}
                </Link>
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="details-stage">
          <h3 id="details-stage" className="text-sm font-bold">
            {t("details.stage")}
          </h3>
          <div
            role="group"
            aria-labelledby="details-stage"
            className="mt-2 flex flex-wrap gap-2"
          >
            {STAGES.map((stage) => (
              <Button
                key={stage}
                type="button"
                aria-pressed={card.stage === stage}
                size="touch"
                variant={
                  card.stage === stage
                    ? "editorialSelected"
                    : "editorialOutline"
                }
                className="px-3"
                onClick={() => {
                  void moveTo(stage);
                }}
              >
                {card.stage === stage && <Check aria-hidden="true" />}
                {t(`stages.${stage}`)}
              </Button>
            ))}
          </div>
          {next && (
            <Button
              type="button"
              variant="editorial"
              size="touch"
              className="mt-3 w-full sm:w-auto"
              onClick={() => {
                void moveTo(next);
              }}
            >
              {t("details.moveNext", { stage: t(`stages.${next}`) })}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
          {moveFailed && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t("moveFailed")}
            </p>
          )}
        </section>

        {playbook && card.platformName && (
          <section
            aria-labelledby="details-playbook"
            className="rounded-xl border border-primary/25 bg-primary/10 p-4"
          >
            <h3
              id="details-playbook"
              className="flex items-center gap-2 text-sm font-bold"
            >
              <Lightbulb className="size-4 text-primary" aria-hidden="true" />
              {t("details.playbookTitle", { platform: card.platformName })}
            </h3>
            <p className="mt-2 text-sm">{playbook.nextStep}</p>
            {playbook.checklist.length > 0 && (
              <ul
                aria-label={t("details.playbookChecklist")}
                className="mt-3 grid gap-1.5 text-sm"
              >
                {playbook.checklist.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CircleCheck
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {t("details.playbookSource", { platform: card.platformName })}
            </p>
          </section>
        )}

        <section
          aria-labelledby="details-dates"
          className="grid gap-4 sm:grid-cols-2"
        >
          <h3 id="details-dates" className="sr-only">
            {t("details.dates")}
          </h3>
          <DateField
            id="applied-on"
            label={t("details.appliedOn")}
            value={details.appliedOn}
            onChange={(value) => {
              setDate("appliedOn", value);
            }}
          />
          <DateField
            id="next-action-on"
            label={t("details.nextActionOn")}
            value={details.nextActionOn}
            onChange={(value) => {
              setDate("nextActionOn", value);
            }}
            quick={[
              [t("details.in3Days"), addDays(today, 3)],
              [t("details.nextWeek"), nextMonday(today)],
            ]}
          />
        </section>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label
              id="details-notes-label"
              htmlFor="card-notes"
              className="text-sm font-bold"
            >
              {t("details.notes")}
            </label>
            <span role="status" className="text-xs text-muted-foreground">
              {saveState === "saving" && t("details.saving")}
              {saveState === "saved" && (
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3.5" aria-hidden="true" />
                  {t("details.saved")}
                </span>
              )}
            </span>
          </div>
          <Textarea
            id="card-notes"
            value={details.notes}
            maxLength={10_000}
            onChange={(event) => {
              editNotes(event.target.value);
            }}
            placeholder={t("details.notesPlaceholder")}
            aria-invalid={notesFailed || undefined}
            aria-describedby={notesFailed ? "notes-error" : undefined}
            className={cn(
              "mt-2 min-h-32 rounded-xl bg-card text-base",
              notesFailed && "border-destructive/50",
            )}
          />
          {notesFailed ? (
            <div
              id="notes-error"
              role="alert"
              className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <span className="flex items-center gap-2">
                <CircleAlert className="size-4" aria-hidden="true" />
                {t("details.notesFailed")}
              </span>
              <Button
                type="button"
                variant="editorialOutline"
                size="touch"
                onClick={() => {
                  saveNotes(details.notes);
                }}
              >
                <RotateCcw aria-hidden="true" />
                {t("details.tryAgain")}
              </Button>
            </div>
          ) : (
            saveState === "error" && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {t("details.saveFailed")}
              </p>
            )
          )}
        </div>

        <History history={details.history} locale={locale} />
      </div>
    </div>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
  quick = [],
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  quick?: [label: string, day: string][];
}) {
  const t = useTranslations("Dashboard");
  return (
    <div className="grid content-start gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-h-11 rounded-xl bg-card text-base [color-scheme:dark]"
      />
      <div className="flex flex-wrap gap-2">
        {quick.map(([quickLabel, day]) => (
          <Button
            key={quickLabel}
            type="button"
            variant="editorialOutline"
            size="touch"
            className="px-3"
            onClick={() => {
              onChange(day);
            }}
          >
            {quickLabel}
          </Button>
        ))}
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="px-3"
            aria-label={t("details.clearDate", { label })}
            onClick={() => {
              onChange("");
            }}
          >
            {t("details.clear")}
          </Button>
        )}
      </div>
    </div>
  );
}

function History({
  history,
  locale,
}: {
  history: CardDetails["history"];
  locale: string;
}) {
  const t = useTranslations("Dashboard");
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });
  return (
    <section aria-labelledby="details-history">
      <h3 id="details-history" className="text-sm font-bold">
        {t("details.history")}
      </h3>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("details.historyEmpty")}
        </p>
      ) : (
        <ol className="relative mt-3 grid gap-4 border-l border-border pl-5">
          {[...history].reverse().map((event, index) => (
            <li key={history.length - index} className="relative">
              <span
                className={cn(
                  "absolute top-1 -left-[27px] size-3 rounded-full border-2 border-popover",
                  index === 0 ? "bg-primary" : "bg-muted-foreground/60",
                )}
                aria-hidden="true"
              />
              <p className="text-sm font-semibold">
                {event.from
                  ? t("details.historyMove", {
                      from: t(`stages.${event.from}`),
                      to: t(`stages.${event.to}`),
                    })
                  : t("details.historyAdded", {
                      stage: t(`stages.${event.to}`),
                    })}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <time dateTime={event.at}>
                  {format.format(Date.parse(event.at))}
                </time>
                {event.viaEmail && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Mail className="size-3" aria-hidden="true" />
                    {t("details.viaEmail")}
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DeleteFooter({
  card,
  onDeleted,
}: {
  card: BoardCardView;
  onDeleted: (card: BoardCardView) => void;
}) {
  const t = useTranslations("Dashboard");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-t border-border px-4 py-3 sm:px-6">
      {failed && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {t("details.deleteFailed")}
        </p>
      )}
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
            {t("details.delete")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("details.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("details.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-11">
              {t("details.keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                startTransition(async () => {
                  const result = await deleteCard({ id: card.id });
                  setFailed(!result.ok);
                  if (result.ok) onDeleted(card);
                });
              }}
            >
              {t("details.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
