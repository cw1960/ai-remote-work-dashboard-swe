/** The board's six columns, in order (mirrors the `card_stage` enum). */
export const STAGES = [
  "saved",
  "applied",
  "assessment",
  "interviewing",
  "offered",
  "rejected",
] as const;
export type Stage = (typeof STAGES)[number];

export const CARD_KINDS = ["job", "platform", "manual"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** Position for a card added to the end of a column. */
export function endPosition(positions: readonly number[]): number {
  return positions.length === 0 ? 1 : Math.max(...positions) + 1;
}
