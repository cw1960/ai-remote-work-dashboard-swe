/**
 * One model call that tailors a master resume to a job, with structured
 * output validated against outputSchema. Everything the model returns is
 * checked again here (completeness, limits, facts) before it can be stored;
 * a failure never falls back to a generic or partial resume.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { unsupportedFacts } from "./facts.ts";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt.ts";
import {
  cleanResume,
  isComplete,
  outputSchema,
  type Resume,
  type StoredReview,
  storedResumeSchema,
  storedReviewSchema,
} from "./schema.ts";

export const MODEL = "claude-opus-5-5";

/** USD per million tokens for MODEL, for the cost estimate in the logs. */
const PRICE_PER_MILLION = { input: 4, output: 20 };

export type TailorErrorCode =
  | "refused"
  | "truncated"
  | "invalid_output"
  | "incomplete"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "not_configured"
  | "failed";

export interface TailorUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * What the API said when it refused a request, for the logs: the HTTP
 * status, the error type (such as "authentication_error") and the request
 * id to look up in the Claude Console. Never the message text.
 */
export interface ApiErrorDetail {
  status: number | null;
  type: string | null;
  requestId: string | null;
}

/** The loggable detail of an API error, or null for other errors. */
export function apiErrorDetail(error: unknown): ApiErrorDetail | null {
  if (!(error instanceof Anthropic.APIError)) return null;
  return {
    status: typeof error.status === "number" ? error.status : null,
    type: error.type ?? null,
    requestId: error.requestID ?? null,
  };
}

export class TailorError extends Error {
  constructor(
    readonly code: TailorErrorCode,
    readonly usage: TailorUsage | null = null,
    readonly detail: ApiErrorDetail | null = null,
  ) {
    super(code);
    this.name = "TailorError";
  }
}

export interface TailorInput {
  jobTitle: string;
  company: string;
  jobDescription: string;
  masterResume: string;
  /** Core skills and evidence from the master profile ("" when none). */
  evidence?: string;
}

export interface TailorResult {
  resume: Resume;
  review: StoredReview;
  model: string;
  usage: TailorUsage;
}

/** Estimated cost of a call, in USD (list prices, before any discounts). */
export function estimateCostUsd(usage: TailorUsage): number {
  return (
    (usage.inputTokens * PRICE_PER_MILLION.input +
      usage.outputTokens * PRICE_PER_MILLION.output) /
    1_000_000
  );
}

/** Maps an SDK error to an error class that is safe to store and show. */
export function classifyError(error: unknown): TailorErrorCode {
  if (error instanceof TailorError) return error.code;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return "not_configured";
  }
  if (
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return "unavailable";
  }
  if (error instanceof Anthropic.APIError) return "failed";
  // Not an API error: the response didn't parse against the schema.
  return "invalid_output";
}

export async function tailorResume(
  client: Anthropic,
  input: TailorInput,
): Promise<TailorResult> {
  let message;
  try {
    message = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16_000,
      // If the model declines, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(outputSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });
  } catch (error) {
    throw new TailorError(classifyError(error), null, apiErrorDetail(error));
  }

  const usage: TailorUsage = {
    inputTokens:
      message.usage.input_tokens +
      (message.usage.cache_creation_input_tokens ?? 0) +
      (message.usage.cache_read_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
  };
  if (message.stop_reason === "refusal")
    throw new TailorError("refused", usage);
  if (message.stop_reason === "max_tokens") {
    throw new TailorError("truncated", usage);
  }
  const output = message.parsed_output;
  if (!output) throw new TailorError("invalid_output", usage);

  const resume = cleanResume(output.resume);
  if (!isComplete(resume)) throw new TailorError("incomplete", usage);
  const stored = storedResumeSchema.safeParse(resume);
  const review = storedReviewSchema.safeParse({
    changes: output.review.changes,
    emphasized: output.review.emphasized,
    gaps: output.review.gaps,
    flags: output.review.flags,
    // The evidence is part of the master profile, so it counts as a source.
    unverified: unsupportedFacts(
      resume,
      `${input.masterResume}\n${input.evidence ?? ""}`,
    ),
  });
  if (!stored.success || !review.success) {
    throw new TailorError("invalid_output", usage);
  }

  return {
    resume: stored.data,
    review: review.data,
    model: message.model,
    usage,
  };
}
