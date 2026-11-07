import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";

import { groupDraftsByRecipient, type UnsentDraft } from "./drafts";

function draft(
  channel: UnsentDraft["channel"],
  body: string,
  scheduledFor: string | null = null,
): UnsentDraft {
  return {
    id: crypto.randomUUID(),
    channel,
    body,
    title: null,
    scheduled_for: scheduledFor,
    kind: "weekly",
    issue_date: "2026-10-05",
  };
}

describe("groupDraftsByRecipient", () => {
  it("sends LinkedIn drafts to the editor and the rest to the owner, in channel order", () => {
    const groups = groupDraftsByRecipient([
      draft("video", "Script"),
      draft("linkedin", "Post"),
      draft("x", "Short"),
      draft("reddit", "Thread"),
    ]);
    expect(groups.map((g) => [g.to, g.drafts.map((d) => d.channel)])).toEqual([
      [siteConfig.newsletter.draftsTo.linkedin, ["linkedin"]],
      [siteConfig.newsletter.draftsTo.other, ["x", "reddit", "video"]],
    ]);
  });

  it("orders a channel's drafts by title, so suggested times run in order", () => {
    const groups = groupDraftsByRecipient([
      { ...draft("x", "Evening"), title: "20:00 · unanswerable" },
      { ...draft("x", "Morning"), title: "09:00 · fuse" },
      { ...draft("bluesky", "Noon"), title: "12:00 · quote" },
    ]);
    expect(groups[0]?.drafts.map((d) => d.body)).toEqual([
      "Morning",
      "Evening",
      "Noon",
    ]);
  });

  it("sends nothing when there are no drafts", () => {
    expect(groupDraftsByRecipient([])).toEqual([]);
  });

  it("leaves the editor out when there is no LinkedIn draft", () => {
    const groups = groupDraftsByRecipient([draft("x", "Short")]);
    expect(groups.map((g) => g.to)).toEqual([
      siteConfig.newsletter.draftsTo.other,
    ]);
  });

  it("lists scheduled posts by time before drafts to post by hand", () => {
    const groups = groupDraftsByRecipient([
      draft("reddit", "Thread"),
      draft("x", "Later", "2026-10-16T22:00:00Z"),
      draft("bluesky", "Sooner", "2026-10-16T16:00:00Z"),
    ]);
    expect(groups[0]?.drafts.map((d) => d.body)).toEqual([
      "Sooner",
      "Later",
      "Thread",
    ]);
  });
});
