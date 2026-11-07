/**
 * The tailor-resume request flow, kept free of Deno so it can be tested:
 * validate the request, reserve a generation (start_resume_generation: job,
 * master resume, lock, daily limit), ask the model, then record the result
 * (finish_resume_generation). Database calls run as the signed-in user, so
 * every check is enforced by the database, not by this code.
 *
 * Logs carry ids, outcome, token counts and an estimated cost; never resume
 * text, job descriptions or provider messages.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { LIMITS } from "./schema.ts";
import {
  type ApiErrorDetail,
  classifyError,
  estimateCostUsd,
  MODEL,
  TailorError,
  type TailorErrorCode,
  tailorResume,
  type TailorUsage,
} from "./tailor.ts";

export type RpcResult =
  { ok: true; data: unknown } | { ok: false; status: number; message: string };

export interface HandlerDeps {
  /** Calls a database function as the signed-in user. */
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  /** Null when ANTHROPIC_API_KEY is not set. */
  client: Anthropic | null;
  log(entry: Record<string, unknown>): void;
  now(): number;
}

export type TailorRequestError =
  | "invalid"
  | "description_too_short"
  | "description_too_long"
  | "not_authenticated"
  | "no_master_resume"
  | "job_not_found"
  | "generation_in_progress"
  | "daily_limit"
  | "not_configured"
  | TailorErrorCode;

export interface HandlerResponse {
  status: number;
  body: { id: string } | { error: TailorRequestError };
}

const requestSchema = z.object({
  jobId: z.guid(),
  jobDescription: z.string(),
});

const startSchema = z
  .array(
    z.object({
      generation_id: z.number().int(),
      master_resume_id: z.guid(),
      master_content: z.string(),
      master_evidence: z
        .string()
        .nullish()
        .transform((value) => value ?? ""),
      job_title: z.string(),
      company: z.string(),
    }),
  )
  .length(1);

/** Database errors the user can act on, by the message the function raises. */
const START_ERRORS: Record<string, [number, TailorRequestError]> = {
  not_authenticated: [401, "not_authenticated"],
  no_master_resume: [409, "no_master_resume"],
  job_not_found: [404, "job_not_found"],
  generation_in_progress: [409, "generation_in_progress"],
  daily_limit: [429, "daily_limit"],
};

/** Provider trouble the user can retry later gets 503; the rest 502. */
const RETRYABLE: TailorErrorCode[] = ["rate_limited", "unavailable", "timeout"];

function fail(status: number, error: TailorRequestError): HandlerResponse {
  return { status, body: { error } };
}

export async function handleTailorRequest(
  rawBody: unknown,
  deps: HandlerDeps,
): Promise<HandlerResponse> {
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid");
  const jobDescription = parsed.data.jobDescription.trim();
  if (jobDescription.length < LIMITS.descriptionMin) {
    return fail(422, "description_too_short");
  }
  if (jobDescription.length > LIMITS.descriptionMax) {
    return fail(422, "description_too_long");
  }

  const started = await deps.rpc("start_resume_generation", {
    p_job_id: parsed.data.jobId,
  });
  if (!started.ok) {
    const known = START_ERRORS[started.message];
    return known ? fail(...known) : fail(500, "failed");
  }
  const reservation = startSchema.safeParse(started.data);
  if (!reservation.success) return fail(500, "failed");
  const generation = reservation.data[0];
  if (!generation) return fail(500, "failed");

  const startedAt = deps.now();
  const finish = (
    outcome:
      | {
          ok: true;
          content: unknown;
          review: unknown;
          model: string;
          usage: TailorUsage;
        }
      | {
          ok: false;
          error: TailorErrorCode | "not_configured";
          usage: TailorUsage | null;
          detail?: ApiErrorDetail | null;
        },
  ) => {
    const usage = outcome.usage;
    deps.log({
      event: "resume_generation",
      generation_id: generation.generation_id,
      ok: outcome.ok,
      error: outcome.ok ? null : outcome.error,
      model: outcome.ok ? outcome.model : MODEL,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      estimated_cost_usd: usage
        ? Number(estimateCostUsd(usage).toFixed(4))
        : null,
      duration_ms: deps.now() - startedAt,
      // Why the API refused (status, type, request id), never its message.
      ...(!outcome.ok && outcome.detail
        ? {
            api_status: outcome.detail.status,
            api_error_type: outcome.detail.type,
            api_request_id: outcome.detail.requestId,
          }
        : {}),
    });
    return deps.rpc("finish_resume_generation", {
      p_generation_id: generation.generation_id,
      p_ok: outcome.ok,
      p_error: outcome.ok ? null : outcome.error,
      p_model: outcome.ok ? outcome.model : MODEL,
      p_input_tokens: usage?.inputTokens ?? null,
      p_output_tokens: usage?.outputTokens ?? null,
      p_content: outcome.ok ? outcome.content : null,
      p_review: outcome.ok ? outcome.review : null,
    });
  };

  if (!deps.client) {
    await finish({ ok: false, error: "not_configured", usage: null });
    return fail(503, "not_configured");
  }

  let result;
  try {
    result = await tailorResume(deps.client, {
      jobTitle: generation.job_title,
      company: generation.company,
      jobDescription,
      masterResume: generation.master_content,
      evidence: generation.master_evidence,
    });
  } catch (error) {
    const code = classifyError(error);
    const usage = error instanceof TailorError ? error.usage : null;
    const detail = error instanceof TailorError ? error.detail : null;
    await finish({ ok: false, error: code, usage, detail });
    return fail(RETRYABLE.includes(code) ? 503 : 502, code);
  }

  const finished = await finish({
    ok: true,
    content: result.resume,
    review: result.review,
    model: result.model,
    usage: result.usage,
  });
  const id = finished.ok ? z.guid().safeParse(finished.data) : null;
  if (!id?.success) return fail(500, "failed");
  return { status: 200, body: { id: id.data } };
}
