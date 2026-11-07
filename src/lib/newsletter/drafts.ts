import { z } from "zod";

import { siteConfig } from "@/config/site";

/** Social channels the newsletter workflow drafts for, in display order. */
export const CHANNELS = [
  "linkedin",
  "x",
  "bluesky",
  "threads",
  "facebook",
  "reddit",
  "video",
] as const;
export type Channel = (typeof CHANNELS)[number];

/** A draft not yet emailed, as newsletter_unsent_drafts() returns it. */
export const unsentDraftSchema = z.object({
  id: z.uuid(),
  channel: z.enum(CHANNELS),
  body: z.string().min(1),
  /** Reddit drafts only. */
  title: z.string().nullable(),
  /** Set when the workflow posts it automatically at this time. */
  scheduled_for: z.string().nullable(),
  kind: z.enum(["daily", "weekly", "social"]),
  issue_date: z.iso.date(),
});
export type UnsentDraft = z.infer<typeof unsentDraftSchema>;

/**
 * Who posts a channel's drafts (the newsletter repo's docs/distribution.md):
 * LinkedIn is the editor's, everything else the owner's.
 */
export function draftRecipient(channel: Channel): string {
  return channel === "linkedin"
    ? siteConfig.newsletter.draftsTo.linkedin
    : siteConfig.newsletter.draftsTo.other;
}

/**
 * One email's worth of drafts per recipient: scheduled posts first, by time,
 * then drafts to post by hand in channel order and, within a channel, by
 * title (the daily posts' titles start with their suggested time, "09:00").
 */
export function groupDraftsByRecipient(
  drafts: readonly UnsentDraft[],
): { to: string; drafts: UnsentDraft[] }[] {
  const time = (draft: UnsentDraft) =>
    draft.scheduled_for === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(draft.scheduled_for);
  const sorted = [...drafts].sort(
    (a, b) =>
      time(a) - time(b) ||
      CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel) ||
      (a.title ?? "").localeCompare(b.title ?? ""),
  );
  const groups = new Map<string, UnsentDraft[]>();
  for (const draft of sorted) {
    const to = draftRecipient(draft.channel);
    groups.set(to, [...(groups.get(to) ?? []), draft]);
  }
  return [...groups].map(([to, group]) => ({ to, drafts: group }));
}
