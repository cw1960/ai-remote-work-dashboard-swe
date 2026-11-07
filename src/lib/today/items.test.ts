import { describe, expect, it } from "vitest";

import type { PassportEntry } from "@/lib/passport/queries";
import type { BoardCard } from "@/lib/tracker/queries";

import { buildTodayItems } from "./items";

const NOW = Date.parse("2026-10-05T15:00:00Z");

function card(overrides: Partial<BoardCard> & { id: string }): BoardCard {
  return {
    kind: "manual",
    title: overrides.id,
    stage: "applied",
    position: 0,
    nextActionAt: null,
    platformName: null,
    job: null,
    tailoredResumeId: null,
    ...overrides,
  };
}

function platform(overrides: Partial<PassportEntry>): PassportEntry {
  return {
    slug: "mercor",
    name: "Mercor",
    status: "not_joined",
    reapplyAfter: null,
    openJobs: 3,
    ...overrides,
  };
}

const closedJob = {
  id: "j",
  closed: true,
  payMin: null,
  payMax: null,
  payUnit: null,
};

describe("buildTodayItems", () => {
  it("is empty when nothing needs doing", () => {
    expect(
      buildTodayItems({ cards: [], passport: [], newMatches: 0, now: NOW }),
    ).toEqual([]);
  });

  it("ranks overdue, due today, reapply, assessments, closed jobs, then new matches", () => {
    const items = buildTodayItems({
      cards: [
        card({ id: "later", nextActionAt: "2026-10-09T00:00:00Z" }),
        card({ id: "today", nextActionAt: "2026-10-05T00:00:00Z" }),
        card({ id: "old", nextActionAt: "2026-10-01T00:00:00Z" }),
        card({ id: "older", nextActionAt: "2026-09-20T00:00:00Z" }),
        card({ id: "test", stage: "assessment" }),
        card({ id: "gone", kind: "job", stage: "saved", job: closedJob }),
        card({
          id: "gone-late",
          kind: "job",
          stage: "interviewing",
          job: closedJob,
        }),
      ],
      passport: [
        platform({ status: "rejected", reapplyAfter: "2026-10-05" }),
        platform({
          slug: "micro1",
          name: "micro1",
          status: "rejected",
          reapplyAfter: "2026-10-06",
        }),
      ],
      newMatches: 4,
      now: NOW,
    });
    expect(items).toEqual([
      {
        kind: "overdue",
        cardId: "older",
        title: "older",
        due: "2026-09-20T00:00:00Z",
      },
      {
        kind: "overdue",
        cardId: "old",
        title: "old",
        due: "2026-10-01T00:00:00Z",
      },
      { kind: "dueToday", cardId: "today", title: "today" },
      { kind: "reapply", slug: "mercor", platform: "Mercor" },
      { kind: "assessment", cardId: "test", title: "test" },
      { kind: "closed", cardId: "gone", title: "gone" },
      { kind: "newMatches", count: 4 },
    ]);
  });
});
