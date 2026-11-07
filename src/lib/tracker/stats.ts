import { DAY_MS } from "./dates";
import type { Stage } from "./stages";

/** What the stats need from a card (see getBoard). */
export interface StatsCard {
  id: string;
  stage: Stage;
  job: {
    payMin: number | null;
    payMax: number | null;
    payUnit: string | null;
  } | null;
}

/** A stage change from card_events, oldest first per card. */
export interface StatsEvent {
  cardId: string;
  toStage: Stage;
  at: string;
}

export interface PipelineStats {
  /** Cards moved to (or added in) Applied in the last 7 days. */
  appliedThisWeek: number;
  /** Of cards that reached Applied, how many heard back. */
  responses: { responded: number; applied: number };
  /** Average whole days a card spends in each waiting stage. */
  daysPerStage: { stage: Stage; days: number }[];
  /** Top hourly pay of active job cards, summed. */
  hourlyInPlay: { total: number; jobs: number };
}

/** Stages that count as hearing back after applying. */
const RESPONSES: ReadonlySet<Stage> = new Set([
  "assessment",
  "interviewing",
  "offered",
  "rejected",
]);
const WAITING: readonly Stage[] = ["applied", "assessment", "interviewing"];
const ACTIVE: ReadonlySet<Stage> = new Set([
  "applied",
  "assessment",
  "interviewing",
  "offered",
]);

/** The Pipeline's stats line. Rules only; `now` is a timestamp in ms. */
export function computeStats(
  cards: readonly StatsCard[],
  events: readonly StatsEvent[],
  now: number,
): PipelineStats {
  const weekAgo = now - 7 * DAY_MS;
  const byCard = new Map<string, StatsEvent[]>();
  for (const event of events) {
    const list = byCard.get(event.cardId) ?? [];
    list.push(event);
    byCard.set(event.cardId, list);
  }
  const live = new Set(cards.map((card) => card.id));

  let appliedThisWeek = 0;
  let applied = 0;
  let responded = 0;
  const spent = new Map<Stage, number[]>();

  for (const [cardId, history] of byCard) {
    if (!live.has(cardId)) continue;
    history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (
      history.some(
        (e) => e.toStage === "applied" && Date.parse(e.at) >= weekAgo,
      )
    ) {
      appliedThisWeek += 1;
    }
    const firstApplied = history.findIndex((e) => e.toStage === "applied");
    if (firstApplied >= 0) {
      applied += 1;
      if (
        history.slice(firstApplied + 1).some((e) => RESPONSES.has(e.toStage))
      ) {
        responded += 1;
      }
    }
    history.forEach((event, i) => {
      if (!WAITING.includes(event.toStage)) return;
      const next = history[i + 1];
      const until = next ? Date.parse(next.at) : now;
      const days = (until - Date.parse(event.at)) / DAY_MS;
      spent.set(event.toStage, [...(spent.get(event.toStage) ?? []), days]);
    });
  }

  const daysPerStage = WAITING.flatMap((stage) => {
    const samples = spent.get(stage);
    if (!samples?.length) return [];
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    return [{ stage, days: Math.round(average) }];
  });

  let total = 0;
  let jobs = 0;
  for (const card of cards) {
    if (!ACTIVE.has(card.stage) || card.job?.payUnit !== "hour") continue;
    const pay = card.job.payMax ?? card.job.payMin;
    if (pay === null || pay <= 0) continue;
    total += pay;
    jobs += 1;
  }

  return {
    appliedThisWeek,
    responses: { responded, applied },
    daysPerStage,
    hourlyInPlay: { total, jobs },
  };
}
