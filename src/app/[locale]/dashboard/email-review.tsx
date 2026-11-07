"use client";

import { Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ignoreInboundEmail, resolveInboundEmail } from "@/lib/inbound/actions";
import type { ReviewEmail } from "@/lib/inbound/queries";
import { formatDay } from "@/lib/tracker/dates";
import { type Stage, STAGES } from "@/lib/tracker/stages";

const NEW_CARD = "new";

/**
 * Dashboard zone: forwarded emails the rules weren't sure about. Each can
 * be filed under a card (moving it) or ignored.
 */
export function EmailReview({
  emails,
  cards,
}: {
  emails: ReviewEmail[];
  cards: { id: string; title: string }[];
}) {
  const t = useTranslations("Inbound");
  const [status, setStatus] = useState<{ text: string; error: boolean }>({
    text: "",
    error: false,
  });

  return (
    <section aria-labelledby="email-review-title" className="mt-8">
      <h2 id="email-review-title" className="text-2xl font-extrabold">
        {t("reviewTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("reviewIntro")}</p>
      <p
        role={status.error ? "alert" : "status"}
        className={
          status.error
            ? "mt-2 min-h-5 text-sm text-destructive"
            : "mt-2 min-h-5 text-sm text-muted-foreground"
        }
      >
        {status.text}
      </p>
      <ul className="mt-2 grid gap-3" aria-labelledby="email-review-title">
        {emails.map((email) => (
          <li key={email.id}>
            <ReviewItem email={email} cards={cards} onDone={setStatus} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewItem({
  email,
  cards,
  onDone,
}: {
  email: ReviewEmail;
  cards: { id: string; title: string }[];
  onDone: (status: { text: string; error: boolean }) => void;
}) {
  const t = useTranslations("Inbound");
  const tStages = useTranslations("Dashboard.stages");
  const locale = useLocale();
  const [card, setCard] = useState(
    email.platform ? NEW_CARD : (cards[0]?.id ?? ""),
  );
  const [stage, setStage] = useState<Stage>(email.stage ?? "applied");
  const [pending, startTransition] = useTransition();
  const cardId = `review-card-${email.id}`;
  const stageId = `review-stage-${email.id}`;

  function run(action: () => Promise<{ ok: boolean }>, done: string) {
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false }));
      onDone(
        result.ok
          ? { text: done, error: false }
          : { text: t("failed"), error: true },
      );
    });
  }

  return (
    <article className="rounded-2xl border border-border p-4 glass-panel">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Mail className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold break-words">
            {email.subject ?? t("noSubject")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("from", {
              domain: email.fromDomain,
              date: formatDay(email.receivedAt, locale),
            })}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor={cardId} className="text-sm font-semibold">
            {t("card")}
          </label>
          <select
            id={cardId}
            value={card}
            onChange={(event) => {
              setCard(event.target.value);
            }}
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
          >
            {!email.platform && (
              <option value="" disabled className="bg-popover">
                {t("chooseCard")}
              </option>
            )}
            {email.platform && (
              <option value={NEW_CARD} className="bg-popover">
                {t("newCard", { platform: email.platform })}
              </option>
            )}
            {cards.map((option) => (
              <option key={option.id} value={option.id} className="bg-popover">
                {option.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={stageId} className="text-sm font-semibold">
            {t("stage")}
          </label>
          <select
            id={stageId}
            value={stage}
            onChange={(event) => {
              setStage(event.target.value as Stage);
            }}
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
          >
            {STAGES.map((option) => (
              <option key={option} value={option} className="bg-popover">
                {tStages(option)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="editorialOutline"
          size="touch"
          disabled={pending}
          onClick={() => {
            run(() => ignoreInboundEmail({ id: email.id }), t("ignored"));
          }}
        >
          {t("ignore")}
        </Button>
        <Button
          type="button"
          variant="editorial"
          size="touch"
          disabled={pending || card === ""}
          onClick={() => {
            run(
              () =>
                resolveInboundEmail({
                  id: email.id,
                  cardId: card === NEW_CARD ? null : card,
                  stage,
                }),
              t("added"),
            );
          }}
        >
          {t("add")}
        </Button>
      </div>
    </article>
  );
}
