"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { fromDateInput, toDateInput } from "./dates";
import { endPosition, type Stage, STAGES } from "./stages";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: "invalid" | "auth" | "failed" };

const moveSchema = z.object({
  id: z.uuid(),
  stage: z.enum(STAGES),
});

/**
 * Moves a card to the end of another column. The stage change is recorded
 * in card_events by a trigger; the first move to Applied sets applied_at.
 */
export async function moveCard(input: unknown): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const { id, stage } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const [column, current] = await Promise.all([
    supabase
      .from("tracker_cards")
      .select("position")
      .eq("user_id", user.id)
      .eq("stage", stage)
      .neq("id", id),
    supabase
      .from("tracker_cards")
      .select("applied_at")
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (column.error || current.error || !current.data) {
    return { ok: false, error: current.data ? "failed" : "invalid" };
  }

  const { error } = await supabase
    .from("tracker_cards")
    .update({
      stage,
      position: endPosition(column.data.map((c) => c.position)),
      ...(stage === "applied" && !current.data.applied_at
        ? { applied_at: new Date().toISOString() }
        : {}),
    })
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) {
    console.error("card not moved", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true, id };
}

const addSchema = z.object({
  title: z.string().trim().min(1).max(300),
});

/** Adds a manual card to the end of Saved. */
export async function addManualCard(input: unknown): Promise<ActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { data: column, error: readError } = await supabase
    .from("tracker_cards")
    .select("position")
    .eq("user_id", user.id)
    .eq("stage", "saved");
  if (readError) return { ok: false, error: "failed" };

  const { data, error } = await supabase
    .from("tracker_cards")
    .insert({
      kind: "manual",
      title: parsed.data.title,
      stage: "saved",
      position: endPosition(column.map((c) => c.position)),
    })
    .select("id")
    .single();
  if (error) {
    console.error("card not added", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true, id: data.id };
}

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

const trackJobSchema = z.object({ jobId: z.guid() });

/**
 * Adds a job to the end of Saved. Tracking a job twice is fine: the
 * existing card is kept (one card per job per user).
 */
export async function trackJob(input: unknown): Promise<ActionResult> {
  const parsed = trackJobSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const [job, existing, column] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title")
      .eq("id", parsed.data.jobId)
      .maybeSingle(),
    supabase
      .from("tracker_cards")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "job")
      .eq("job_id", parsed.data.jobId)
      .maybeSingle(),
    supabase
      .from("tracker_cards")
      .select("position")
      .eq("user_id", user.id)
      .eq("stage", "saved"),
  ]);
  if (job.error || existing.error || column.error) {
    return { ok: false, error: "failed" };
  }
  if (!job.data) return { ok: false, error: "invalid" };
  if (existing.data) return { ok: true, id: existing.data.id };

  const { data, error } = await supabase
    .from("tracker_cards")
    .insert({
      kind: "job",
      job_id: job.data.id,
      title: job.data.title.slice(0, 300),
      stage: "saved",
      position: endPosition(column.data.map((c) => c.position)),
    })
    .select("id")
    .single();
  if (error) {
    // Tracked at the same moment elsewhere (one card per job): fine.
    if (error.code === UNIQUE_VIOLATION) {
      const again = await supabase
        .from("tracker_cards")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "job")
        .eq("job_id", job.data.id)
        .maybeSingle();
      if (again.data) return { ok: true, id: again.data.id };
    }
    console.error("job not tracked", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true, id: data.id };
}

const trackPlatformSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
});

/** Adds an onboarding card for a listed platform to Saved (once). */
export async function trackPlatform(input: unknown): Promise<ActionResult> {
  const parsed = trackPlatformSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { data: platform, error: platformError } = await supabase
    .from("platforms")
    .select("id, name")
    .eq("slug", parsed.data.slug)
    .eq("listed", true)
    .maybeSingle();
  if (platformError) return { ok: false, error: "failed" };
  if (!platform) return { ok: false, error: "invalid" };

  const [existing, column] = await Promise.all([
    supabase
      .from("tracker_cards")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "platform")
      .eq("platform_id", platform.id)
      .maybeSingle(),
    supabase
      .from("tracker_cards")
      .select("position")
      .eq("user_id", user.id)
      .eq("stage", "saved"),
  ]);
  if (existing.error || column.error) return { ok: false, error: "failed" };
  if (existing.data) return { ok: true, id: existing.data.id };

  const { data, error } = await supabase
    .from("tracker_cards")
    .insert({
      kind: "platform",
      platform_id: platform.id,
      title: platform.name,
      stage: "saved",
      position: endPosition(column.data.map((c) => c.position)),
    })
    .select("id")
    .single();
  if (error) {
    // Tracked at the same moment elsewhere (one card per platform): fine.
    if (error.code === UNIQUE_VIOLATION) {
      const again = await supabase
        .from("tracker_cards")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "platform")
        .eq("platform_id", platform.id)
        .maybeSingle();
      if (again.data) return { ok: true, id: again.data.id };
    }
    console.error("platform not tracked", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true, id: data.id };
}

const updateSchema = z
  .object({
    id: z.uuid(),
    /** Manual cards only: job and platform cards keep their source's name. */
    title: z.string().trim().min(1).max(300).optional(),
    appliedOn: z.iso.date().nullable().optional(),
    nextActionOn: z.iso.date().nullable().optional(),
    notes: z.string().max(10_000).optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.appliedOn !== undefined ||
      input.nextActionOn !== undefined ||
      input.notes !== undefined,
  );

/** Edits a card's title (manual cards), dates or notes. */
export async function updateCard(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const { id, title, appliedOn, nextActionOn, notes } = parsed.data;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("tracker_cards")
    .update({
      ...(title === undefined ? {} : { title }),
      ...(appliedOn === undefined
        ? {}
        : { applied_at: fromDateInput(appliedOn ?? "") }),
      ...(nextActionOn === undefined
        ? {}
        : { next_action_at: fromDateInput(nextActionOn ?? "") }),
      ...(notes === undefined ? {} : { notes: notes.trim() ? notes : null }),
    })
    .eq("user_id", user.id)
    .eq("id", id);
  if (title !== undefined) query = query.eq("kind", "manual");
  const { data, error } = await query.select("id");
  if (error) {
    console.error("card not updated", error);
    return { ok: false, error: "failed" };
  }
  if (data.length === 0) return { ok: false, error: "invalid" };
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true, id };
}

const cardIdSchema = z.object({ id: z.uuid() });

/** Deletes a card; its stage history goes with it. */
export async function deleteCard(input: unknown): Promise<ActionResult> {
  const parsed = cardIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tracker_cards")
    .delete()
    .eq("user_id", user.id)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) {
    console.error("card not deleted", error);
    return { ok: false, error: "failed" };
  }
  if (data.length === 0) return { ok: false, error: "invalid" };
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: true, id: parsed.data.id };
}

/** One stage change in a card's history; `from` is null when it was added. */
export interface CardEvent {
  from: Stage | null;
  to: Stage;
  viaEmail: boolean;
  at: string;
}

/** What the card details sheet shows beyond the board tile. */
export interface CardDetails {
  appliedOn: string;
  nextActionOn: string;
  notes: string;
  /** Job cards: when the listing closed. */
  closedAt: string | null;
  history: CardEvent[];
  /** The platform's playbook, by stage (empty for manual cards). */
  playbooks: Partial<Record<Stage, Playbook>>;
}

/** What usually comes next at a stage on a platform, and a checklist. */
export interface Playbook {
  nextStep: string;
  checklist: string[];
}

const checklistSchema = z.array(z.string());

export type DetailsResult =
  | { ok: true; details: CardDetails }
  | { ok: false; error: "invalid" | "auth" | "failed" };

/** A card's dates, notes and stage history, oldest move first. */
export async function getCardDetails(input: unknown): Promise<DetailsResult> {
  const parsed = cardIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tracker_cards")
    .select(
      "applied_at, next_action_at, notes, platform_id, job:jobs(closed_at, platform_id), events:card_events(from_stage, to_stage, source, at)",
    )
    .eq("user_id", user.id)
    .eq("id", parsed.data.id)
    .order("at", { referencedTable: "card_events" })
    .maybeSingle();
  if (error) {
    console.error("card details not loaded", error);
    return { ok: false, error: "failed" };
  }
  if (!data) return { ok: false, error: "invalid" };

  const platformId = data.job?.platform_id ?? data.platform_id;
  const playbooks: Partial<Record<Stage, Playbook>> = {};
  if (platformId) {
    const { data: rows, error: playbookError } = await supabase
      .from("playbooks")
      .select("stage, next_step, checklist")
      .eq("platform_id", platformId);
    // Playbooks are extra help: without them the sheet still works.
    if (playbookError) console.error("playbooks not loaded", playbookError);
    for (const row of rows ?? []) {
      const checklist = checklistSchema.safeParse(row.checklist);
      playbooks[row.stage] = {
        nextStep: row.next_step,
        checklist: checklist.success ? checklist.data : [],
      };
    }
  }

  return {
    ok: true,
    details: {
      playbooks,
      appliedOn: toDateInput(data.applied_at),
      nextActionOn: toDateInput(data.next_action_at),
      notes: data.notes ?? "",
      closedAt: data.job?.closed_at ?? null,
      history: data.events.map((event) => ({
        from: event.from_stage,
        to: event.to_stage,
        viaEmail: event.source === "email",
        at: event.at,
      })),
    },
  };
}
