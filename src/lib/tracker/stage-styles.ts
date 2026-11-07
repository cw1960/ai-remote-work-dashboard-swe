import type { Stage } from "./stages";

/**
 * Per-stage colour classes (tokens --stage-*, src/styles/tokens.css).
 * Written out in full so Tailwind finds them.
 */
export const STAGE_STYLES: Record<Stage, { tile: string; dot: string }> = {
  saved: {
    tile: "border-l-stage-saved bg-stage-saved/10",
    dot: "bg-stage-saved",
  },
  applied: {
    tile: "border-l-stage-applied bg-stage-applied/12",
    dot: "bg-stage-applied",
  },
  assessment: {
    tile: "border-l-stage-assessment bg-stage-assessment/12",
    dot: "bg-stage-assessment",
  },
  interviewing: {
    tile: "border-l-stage-interviewing bg-stage-interviewing/12",
    dot: "bg-stage-interviewing",
  },
  offered: {
    tile: "border-l-stage-offered bg-stage-offered/12",
    dot: "bg-stage-offered",
  },
  rejected: {
    tile: "border-l-stage-rejected bg-stage-rejected/12",
    dot: "bg-stage-rejected",
  },
};
