"use client";

import {
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  MoreHorizontal,
  Plus,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  type SubmitEvent,
  useState,
  useTransition,
} from "react";

import { PlaybookTip } from "@/components/playbook/promo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { addManualCard, moveCard } from "@/lib/tracker/actions";
import type { BoardCard } from "@/lib/tracker/queries";
import { type Stage, STAGES } from "@/lib/tracker/stages";
import { STAGE_STYLES } from "@/lib/tracker/stage-styles";
import { cn } from "@/lib/utils";

import { CardDetailsSheet } from "./card-details";
import { Celebration } from "./celebration";

/** A card plus labels resolved on the server (dates, pay). */
export interface BoardCardView extends BoardCard {
  payLabel: string | null;
  dueLabel: string | null;
  overdue: boolean;
}

const KIND_ICONS = {
  job: BriefcaseBusiness,
  platform: Sparkles,
  manual: FileText,
} as const;

const DRAG_TYPE = "application/x-tracker-card";

/**
 * The pipeline: six columns on desktop, one column at a time with stage tabs
 * on phones. Cards move by drag-and-drop (desktop) or the "Move to…" menu
 * (everywhere, keyboard included). Moves show at once and roll back if the
 * server refuses them. A card's title opens its details sheet.
 */
export function Board({
  initialCards,
  openCardId = null,
  stats,
}: {
  initialCards: BoardCardView[];
  /** The stats line under the heading (rendered on the server). */
  stats?: ReactNode;
  /** A card to open on arrival (the Today panel links to `?card=`). */
  openCardId?: string | null;
}) {
  const t = useTranslations("Dashboard");
  const [cards, setCards] = useState(initialCards);
  // Fresh server data (e.g. the Platform Passport moved a card) wins.
  const [serverCards, setServerCards] = useState(initialCards);

  const [activeStage, setActiveStage] = useState<Stage>(
    () => initialCards[0]?.stage ?? "saved",
  );
  if (initialCards !== serverCards) {
    setServerCards(initialCards);
    setCards(initialCards);
    // Phones show one column: if it's empty now, show one with cards.
    const first = initialCards[0];
    if (first && !initialCards.some((c) => c.stage === activeStage)) {
      setActiveStage(first.stage);
    }
  }
  const [celebration, setCelebration] = useState(0);
  const [status, setStatus] = useState<{ text: string; error: boolean }>({
    text: "",
    error: false,
  });
  const [openId, setOpenId] = useState<string | null>(openCardId);
  const [requestedId, setRequestedId] = useState(openCardId);
  if (openCardId !== requestedId) {
    setRequestedId(openCardId);
    setOpenId(openCardId);
  }
  const router = useRouter();
  /** Closes the sheet, dropping `?card=` so a reload doesn't reopen it. */
  function closeCard() {
    setOpenId(null);
    if (openCardId) router.replace("/dashboard", { scroll: false });
  }

  async function move(id: string, stage: Stage): Promise<boolean> {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return false;
    const update = (to: Stage, position: number) => {
      setCards((current) =>
        current.map((c) => (c.id === id ? { ...c, stage: to, position } : c)),
      );
    };
    update(stage, Number.MAX_SAFE_INTEGER);
    setActiveStage(stage);
    const result = await moveCard({ id, stage }).catch(() => null);
    if (result?.ok) {
      setStatus({
        text:
          stage === "offered"
            ? t("movedOffered", { title: card.title })
            : t("moved", { title: card.title, stage: t(`stages.${stage}`) }),
        error: false,
      });
      if (stage === "offered") setCelebration((n) => n + 1);
      return true;
    }
    update(card.stage, card.position);
    setStatus({ text: t("moveFailed"), error: true });
    return false;
  }

  function onMove(id: string, stage: Stage) {
    void move(id, stage);
  }

  const byStage = (stage: Stage) =>
    cards
      .filter((c) => c.stage === stage)
      .sort((a, b) => a.position - b.position);

  return (
    <section aria-labelledby="pipeline-title" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-primary uppercase">
            {t("pipelineEyebrow")}
          </p>
          <h2 id="pipeline-title" className="mt-1 text-2xl font-extrabold">
            {t("pipeline")}
          </h2>
        </div>
        <AddCardDialog
          onAdded={(card) => {
            setCards((current) => [...current, card]);
            setActiveStage("saved");
          }}
        />
      </div>

      {stats}
      {celebration > 0 && <Celebration key={celebration} />}

      <p
        role={status.error ? "alert" : "status"}
        className={cn(
          "mt-3 min-h-5 text-sm",
          status.error ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {status.text}
      </p>

      {cards.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-border px-6 py-12 text-center glass-panel">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <BriefcaseBusiness className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-4 font-bold">{t("emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("emptyBody")}
          </p>
          <Button asChild variant="editorial" size="touch" className="mt-5">
            <Link href="/jobs">{t("findJob")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Phones: one column at a time. */}
          <div className="-mx-4 mt-2 overflow-x-auto px-4 lg:hidden">
            <div
              role="tablist"
              aria-label={t("stagesLabel")}
              className="flex min-w-max gap-2 pb-1"
            >
              {STAGES.map((stage) => (
                <Button
                  key={stage}
                  type="button"
                  role="tab"
                  id={`tab-${stage}`}
                  aria-selected={activeStage === stage}
                  aria-controls="stage-panel"
                  variant={
                    activeStage === stage
                      ? "editorialSelected"
                      : "editorialOutline"
                  }
                  size="touch"
                  onClick={() => {
                    setActiveStage(stage);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      STAGE_STYLES[stage].dot,
                    )}
                  />
                  {t(`stages.${stage}`)}
                  <Badge variant="secondary">{byStage(stage).length}</Badge>
                </Button>
              ))}
            </div>
          </div>
          <div
            id="stage-panel"
            role="tabpanel"
            aria-labelledby={`tab-${activeStage}`}
            className="mt-4 lg:hidden"
          >
            <Column
              stage={activeStage}
              cards={byStage(activeStage)}
              onMove={onMove}
              onOpen={setOpenId}
              showHeading={false}
            />
          </div>

          {/* Desktop: all six columns. */}
          <div className="mt-2 hidden grid-cols-6 gap-3 lg:grid">
            {STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                cards={byStage(stage)}
                onMove={onMove}
                onOpen={setOpenId}
                showHeading
              />
            ))}
          </div>
        </>
      )}

      <CardDetailsSheet
        card={cards.find((c) => c.id === openId) ?? null}
        onClose={closeCard}
        onMove={move}
        onPatch={(id, patch) => {
          setCards((current) =>
            current.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          );
        }}
        onDeleted={(card) => {
          closeCard();
          setCards((current) => current.filter((c) => c.id !== card.id));
          setStatus({
            text: t("deleted", { title: card.title }),
            error: false,
          });
        }}
      />
    </section>
  );
}

function Column({
  stage,
  cards,
  onMove,
  onOpen,
  showHeading,
}: {
  stage: Stage;
  cards: BoardCardView[];
  onMove: (id: string, stage: Stage) => void;
  onOpen: (id: string) => void;
  showHeading: boolean;
}) {
  const t = useTranslations("Dashboard");
  const tPromo = useTranslations("PlaybookPromo");
  const [over, setOver] = useState(false);
  const headingId = `column-${stage}${showHeading ? "" : "-mobile"}`;

  return (
    // Drag-and-drop is a mouse shortcut; the "Move to…" menu is the
    // keyboard- and screen-reader-accessible way to move cards.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-labelledby={showHeading ? headingId : undefined}
      aria-label={showHeading ? undefined : t(`stages.${stage}`)}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const id = event.dataTransfer.getData(DRAG_TYPE);
        if (id) onMove(id, stage);
      }}
      className={cn(
        "min-w-0 rounded-2xl border bg-card/30 p-2 transition-colors",
        over ? "border-primary/60 bg-primary/10" : "border-border",
      )}
    >
      {showHeading && (
        <div className="flex min-h-11 items-center justify-between gap-2 px-2">
          <h3
            id={headingId}
            className="flex items-center gap-2 text-sm font-bold"
          >
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-full", STAGE_STYLES[stage].dot)}
            />
            {t(`stages.${stage}`)}
          </h3>
          <Badge variant="secondary">
            <span aria-hidden="true">{cards.length}</span>
            <span className="sr-only">
              {t("cardCount", { count: cards.length })}
            </span>
          </Badge>
        </div>
      )}
      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
          {t("noCards")}
        </p>
      ) : (
        <ul className="grid gap-2">
          {cards.map((card) => (
            <li key={card.id}>
              <Tile card={card} onMove={onMove} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
      {cards.length > 0 &&
        (stage === "assessment" || stage === "interviewing") && (
          <PlaybookTip
            message={tPromo(stage)}
            refTag={`tracker-${stage}`}
            className="px-2 pt-3 pb-1"
          />
        )}
    </section>
  );
}

function Tile({
  card,
  onMove,
  onOpen,
}: {
  card: BoardCardView;
  onMove: (id: string, stage: Stage) => void;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("Dashboard");
  const Icon = KIND_ICONS[card.kind];
  return (
    // Drag-and-drop is a mouse shortcut; the "Move to…" menu is the
    // keyboard- and screen-reader-accessible way to move cards.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, card.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "cursor-grab rounded-xl border border-l-4 border-border p-3 shadow-sm active:cursor-grabbing",
        STAGE_STYLES[card.stage].tile,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge
          variant="outline"
          className="gap-1 border-border bg-secondary text-muted-foreground"
        >
          <Icon className="size-3" aria-hidden="true" />
          {t(`kinds.${card.kind}`)}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-1 size-11 shrink-0"
              aria-label={t("moveCard", { title: card.title })}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
            {STAGES.filter((stage) => stage !== card.stage).map((stage) => (
              <DropdownMenuItem
                key={stage}
                onSelect={() => {
                  onMove(card.id, stage);
                }}
              >
                {t(`stages.${stage}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <h4 className="mt-1 text-sm leading-snug font-bold break-words">
        <button
          type="button"
          onClick={() => {
            onOpen(card.id);
          }}
          className="cursor-pointer rounded text-left break-words hover:underline"
        >
          {card.title}
        </button>
      </h4>
      {(card.platformName ?? card.payLabel) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {[card.kind === "platform" ? null : card.platformName, card.payLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {(card.job?.closed ?? card.dueLabel) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.job?.closed && (
            <Badge
              variant="outline"
              className="border-border bg-secondary text-muted-foreground"
            >
              {t("closed")}
            </Badge>
          )}
          {card.dueLabel && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1 border-border text-muted-foreground",
                card.overdue &&
                  "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              <CalendarClock className="size-3" aria-hidden="true" />
              {card.overdue
                ? t("overdue", { date: card.dueLabel })
                : t("due", { date: card.dueLabel })}
            </Badge>
          )}
        </div>
      )}
    </article>
  );
}

function AddCardDialog({
  onAdded,
}: {
  onAdded: (card: BoardCardView) => void;
}) {
  const t = useTranslations("Dashboard");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    startTransition(async () => {
      const result = await addManualCard({ title: clean });
      if (!result.ok) {
        setError(true);
        return;
      }
      onAdded({
        id: result.id,
        kind: "manual",
        title: clean,
        stage: "saved",
        position: Number.MAX_SAFE_INTEGER,
        tailoredResumeId: null,
        nextActionAt: null,
        platformName: null,
        job: null,
        payLabel: null,
        dueLabel: null,
        overdue: false,
      });
      setTitle("");
      setError(false);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="editorial" size="touch">
          <Plus aria-hidden="true" />
          {t("addCard")}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl border-border bg-popover">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addDescription")}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm font-semibold">
            {t("cardTitle")}
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value.slice(0, 300));
              }}
              placeholder={t("cardTitlePlaceholder")}
              className="h-12 rounded-xl bg-background text-base"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t("addFailed")}
            </p>
          )}
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
              disabled={pending || !title.trim()}
            >
              {t("addToSaved")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
