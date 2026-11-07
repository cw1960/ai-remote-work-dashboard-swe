import { describe, expect, it } from "vitest";

import { computeStats, type StatsCard, type StatsEvent } from "./stats";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function job(payMax: number | null, payUnit = "hour") {
  return { payMin: null, payMax, payUnit };
}

describe("computeStats", () => {
  it("is all zeros for an empty board", () => {
    expect(computeStats([], [], NOW)).toEqual({
      appliedThisWeek: 0,
      responses: { responded: 0, applied: 0 },
      daysPerStage: [],
      hourlyInPlay: { total: 0, jobs: 0 },
    });
  });

  it("counts applications, responses, days per stage and pay in play", () => {
    const cards: StatsCard[] = [
      { id: "a", stage: "interviewing", job: job(50) },
      { id: "b", stage: "applied", job: job(30) },
      { id: "c", stage: "saved", job: job(100) },
      { id: "d", stage: "applied", job: job(2000, "month") },
      { id: "e", stage: "rejected", job: null },
    ];
    const events: StatsEvent[] = [
      { cardId: "a", toStage: "saved", at: day(20) },
      { cardId: "a", toStage: "applied", at: day(14) },
      { cardId: "a", toStage: "interviewing", at: day(10) },
      { cardId: "b", toStage: "applied", at: day(2) },
      { cardId: "c", toStage: "saved", at: day(1) },
      { cardId: "d", toStage: "applied", at: day(30) },
      { cardId: "e", toStage: "applied", at: day(9) },
      { cardId: "e", toStage: "rejected", at: day(3) },
      // A deleted card's history is ignored.
      { cardId: "gone", toStage: "applied", at: day(1) },
    ];
    expect(computeStats(cards, events, NOW)).toEqual({
      appliedThisWeek: 1,
      responses: { responded: 2, applied: 4 },
      // Applied: a 4, b 2, d 30, e 6 → 10.5 → 11; Interviewing: a 10.
      daysPerStage: [
        { stage: "applied", days: 11 },
        { stage: "interviewing", days: 10 },
      ],
      hourlyInPlay: { total: 80, jobs: 2 },
    });
  });
});
