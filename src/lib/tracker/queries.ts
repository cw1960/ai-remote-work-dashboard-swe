import "server-only";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { CardKind, Stage } from "./stages";
import type { StatsEvent } from "./stats";

/** One card on the board, with what its tile shows. */
export interface BoardCard {
  id: string;
  kind: CardKind;
  title: string;
  stage: Stage;
  position: number;
  nextActionAt: string | null;
  /** The platform for job and platform cards. */
  platformName: string | null;
  /** Job cards only. */
  job: {
    id: string;
    closed: boolean;
    payMin: number | null;
    payMax: number | null;
    payUnit: string | null;
  } | null;
  /** The tailored resume saved for this job's application, if any. */
  tailoredResumeId: string | null;
}

/** The signed-in user's cards, column by column; null when signed out. */
export async function getBoard(): Promise<BoardCard[] | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tracker_cards")
    .select(
      "id, kind, title, stage, position, next_action_at, tailored_resume_id, platform:platforms(name), job:jobs(id, status, pay_min, pay_max, pay_unit, platform:platforms!inner(name))",
    )
    .eq("user_id", user.id)
    .order("position")
    .order("created_at");
  if (error) throw new Error(error.message);

  return data.map((card) => ({
    id: card.id,
    kind: card.kind,
    title: card.title,
    stage: card.stage,
    position: card.position,
    nextActionAt: card.next_action_at,
    platformName: card.job?.platform.name ?? card.platform?.name ?? null,
    job: card.job
      ? {
          id: card.job.id,
          closed: card.job.status !== "open",
          payMin: card.job.pay_min,
          payMax: card.job.pay_max,
          payUnit: card.job.pay_unit,
        }
      : null,
    tailoredResumeId: card.tailored_resume_id,
  }));
}

/** Which of these jobs the signed-in user tracks (empty when signed out). */
export async function getTrackedJobIds(
  jobIds: readonly string[],
): Promise<Set<string>> {
  const user = await getSessionUser();
  if (!user || jobIds.length === 0) return new Set();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tracker_cards")
    .select("job_id")
    .eq("user_id", user.id)
    .eq("kind", "job")
    .in("job_id", jobIds);
  if (error) throw new Error(error.message);
  return new Set(data.flatMap((card) => (card.job_id ? [card.job_id] : [])));
}

/** Whether the signed-in user tracks onboarding with this platform. */
export async function isPlatformTracked(
  platformSlug: string,
): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("tracker_cards")
    .select("id, platform:platforms!inner(slug)", {
      count: "exact",
      head: true,
    })
    .eq("user_id", user.id)
    .eq("kind", "platform")
    .eq("platform.slug", platformSlug);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * For job cards: whether each job is tracked, or null for every job when
 * signed out (the button then leads to sign-in).
 */
export async function trackedLookup(
  jobIds: readonly string[],
): Promise<(jobId: string) => boolean | null> {
  const user = await getSessionUser();
  if (!user) return () => null;
  const tracked = await getTrackedJobIds(jobIds);
  return (jobId) => tracked.has(jobId);
}

/** The signed-in user's stage history, oldest first, for the stats line. */
export async function getStageHistory(): Promise<StatsEvent[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("card_events")
    .select("card_id, to_stage, at")
    .eq("user_id", user.id)
    .order("at");
  if (error) throw new Error(error.message);
  return data.map((event) => ({
    cardId: event.card_id,
    toStage: event.to_stage,
    at: event.at,
  }));
}
