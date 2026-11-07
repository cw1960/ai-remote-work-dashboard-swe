import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { MASTER_RESUME, TAILOR_OUTPUT } from "./fixtures.ts";
import {
  handleTailorRequest,
  type HandlerDeps,
  type RpcResult,
} from "./handler.ts";
import { MODEL } from "./tailor.ts";

const JOB_ID = "00000000-0000-0000-0000-0000000000f1";
const DRAFT_ID = "00000000-0000-0000-0000-0000000000d1";
const DESCRIPTION = "Grade Spanish writing against detailed rubrics. ".repeat(
  10,
);

const STARTED: RpcResult = {
  ok: true,
  data: [
    {
      generation_id: 7,
      master_resume_id: "00000000-0000-0000-0000-0000000000a1",
      master_content: MASTER_RESUME,
      job_title: "Spanish Tutor",
      company: "Mercor",
    },
  ],
};

function modelClient(reply: () => Response, bodies: string[] = []): Anthropic {
  return new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: (_url, init) => {
      bodies.push(String(init?.body));
      return Promise.resolve(reply());
    },
  });
}

const goodReply = () =>
  Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text: JSON.stringify(TAILOR_OUTPUT) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 4000, output_tokens: 1500 },
  });

function setup(
  overrides: {
    start?: RpcResult;
    finish?: RpcResult;
    client?: Anthropic | null;
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: HandlerDeps = {
    rpc: (name, args) => {
      calls.push({ name, args });
      if (name === "start_resume_generation") {
        return Promise.resolve(overrides.start ?? STARTED);
      }
      return Promise.resolve(overrides.finish ?? { ok: true, data: DRAFT_ID });
    },
    client:
      overrides.client === undefined
        ? modelClient(goodReply)
        : overrides.client,
    log: (entry) => logs.push(entry),
    now: () => 0,
  };
  return { deps, calls, logs };
}

describe("handleTailorRequest", () => {
  it("tailors the job's description and stores a draft", async () => {
    const bodies: string[] = [];
    const { deps, calls } = setup({ client: modelClient(goodReply, bodies) });
    const response = await handleTailorRequest(
      { jobId: JOB_ID, jobDescription: `  ${DESCRIPTION}  ` },
      deps,
    );

    expect(response).toEqual({ status: 200, body: { id: DRAFT_ID } });
    expect(calls[0]).toEqual({
      name: "start_resume_generation",
      args: { p_job_id: JOB_ID },
    });
    // No evidence on the profile: no evidence block.
    expect(bodies[0]).not.toContain("core_evidence");
    // The job's own title and company, and the description it was given.
    expect(bodies[0]).toContain("Title: Spanish Tutor");
    expect(bodies[0]).toContain("Company: Mercor");
    expect(bodies[0]).toContain(
      "Grade Spanish writing against detailed rubrics.",
    );
    const finish = calls[1];
    expect(finish?.name).toBe("finish_resume_generation");
    expect(finish?.args).toMatchObject({
      p_generation_id: 7,
      p_ok: true,
      p_content: TAILOR_OUTPUT.resume,
      p_input_tokens: 4000,
      p_output_tokens: 1500,
    });
  });

  it("sends the master profile's core skills and evidence", async () => {
    const bodies: string[] = [];
    const [row] = STARTED.ok ? (STARTED.data as Record<string, unknown>[]) : [];
    const { deps } = setup({
      client: modelClient(goodReply, bodies),
      start: {
        ok: true,
        data: [{ ...row, master_evidence: "Raised pass rates 18% in 2023." }],
      },
    });
    await handleTailorRequest(
      { jobId: JOB_ID, jobDescription: DESCRIPTION },
      deps,
    );
    expect(bodies[0]).toContain(
      "<core_evidence>\\nRaised pass rates 18% in 2023.\\n</core_evidence>",
    );
  });

  it("logs usage and cost without any resume or job text", async () => {
    const { deps, logs } = setup();
    await handleTailorRequest(
      { jobId: JOB_ID, jobDescription: DESCRIPTION },
      deps,
    );
    expect(logs).toEqual([
      {
        event: "resume_generation",
        generation_id: 7,
        ok: true,
        error: null,
        model: MODEL,
        input_tokens: 4000,
        output_tokens: 1500,
        estimated_cost_usd: 0.046,
        duration_ms: 0,
      },
    ]);
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain("Colegio Sol");
    expect(logged).not.toContain("rubrics");
  });

  it.each([
    [{ jobId: "not-a-uuid", jobDescription: DESCRIPTION }, 400, "invalid"],
    [{ jobId: JOB_ID }, 400, "invalid"],
    [
      { jobId: JOB_ID, jobDescription: "Short summary." },
      422,
      "description_too_short",
    ],
    [
      { jobId: JOB_ID, jobDescription: "x".repeat(20_001) },
      422,
      "description_too_long",
    ],
  ])(
    "rejects a bad request without calling anything",
    async (body, status, error) => {
      const { deps, calls } = setup();
      expect(await handleTailorRequest(body, deps)).toEqual({
        status,
        body: { error },
      });
      expect(calls).toEqual([]);
    },
  );

  it.each([
    ["no_master_resume", 409],
    ["job_not_found", 404],
    ["generation_in_progress", 409],
    ["daily_limit", 429],
    ["not_authenticated", 401],
  ])("passes on the database's %s", async (message, status) => {
    const { deps, calls } = setup({
      start: { ok: false, status: 400, message },
    });
    expect(
      await handleTailorRequest(
        { jobId: JOB_ID, jobDescription: DESCRIPTION },
        deps,
      ),
    ).toEqual({ status, body: { error: message } });
    expect(calls).toHaveLength(1);
  });

  it("records a missing API key as a failed generation", async () => {
    const { deps, calls } = setup({ client: null });
    expect(
      await handleTailorRequest(
        { jobId: JOB_ID, jobDescription: DESCRIPTION },
        deps,
      ),
    ).toEqual({ status: 503, body: { error: "not_configured" } });
    expect(calls[1]?.args).toMatchObject({
      p_ok: false,
      p_error: "not_configured",
    });
  });

  it("logs why the API refused the key, without its message", async () => {
    const { deps, logs } = setup({
      client: modelClient(() =>
        Response.json(
          {
            type: "error",
            error: {
              type: "authentication_error",
              message: "invalid x-api-key",
            },
          },
          { status: 401, headers: { "request-id": "req_test123" } },
        ),
      ),
    });
    expect(
      await handleTailorRequest(
        { jobId: JOB_ID, jobDescription: DESCRIPTION },
        deps,
      ),
    ).toEqual({ status: 502, body: { error: "not_configured" } });
    expect(logs[0]).toMatchObject({
      error: "not_configured",
      api_status: 401,
      api_error_type: "authentication_error",
      api_request_id: "req_test123",
    });
    expect(JSON.stringify(logs)).not.toContain("invalid x-api-key");
  });

  it("records a provider failure and stores no resume", async () => {
    const { deps, calls } = setup({
      client: modelClient(() =>
        Response.json(
          {
            type: "error",
            error: { type: "overloaded_error", message: "busy" },
          },
          { status: 529 },
        ),
      ),
    });
    expect(
      await handleTailorRequest(
        { jobId: JOB_ID, jobDescription: DESCRIPTION },
        deps,
      ),
    ).toEqual({ status: 503, body: { error: "unavailable" } });
    expect(calls[1]?.args).toMatchObject({
      p_ok: false,
      p_error: "unavailable",
      p_content: null,
      p_review: null,
    });
  });

  it("answers 502 for output that can't be used", async () => {
    const { deps } = setup({
      client: modelClient(() =>
        Response.json({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: MODEL,
          content: [{ type: "text", text: "{}" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      ),
    });
    expect(
      await handleTailorRequest(
        { jobId: JOB_ID, jobDescription: DESCRIPTION },
        deps,
      ),
    ).toEqual({ status: 502, body: { error: "invalid_output" } });
  });
});
