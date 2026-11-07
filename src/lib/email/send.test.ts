import { describe, expect, it, vi } from "vitest";

import { siteConfig } from "@/config/site";

vi.mock("server-only", () => ({}));

const { sendBatch, toResendEmail } = await import("./send");

const email = {
  to: "a@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
};

describe("toResendEmail", () => {
  it("sends from the brand address, replies to support", () => {
    expect(toResendEmail(email)).toEqual({
      from: `${siteConfig.name} <${siteConfig.senderAddress}>`,
      to: ["a@example.com"],
      reply_to: siteConfig.supportEmail,
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("adds one-click unsubscribe headers when there is a link", () => {
    const url = "https://example.com/api/unsubscribe?token=t&list=reminders";
    expect(toResendEmail({ ...email, unsubscribeUrl: url }).headers).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});

describe("sendBatch", () => {
  it("skips sending without an API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await sendBatch([email], "key")).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the batch with an idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: [{ id: "1" }] }));

    expect(await sendBatch([email], "reminders/2026-10-05/u1")).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails/batch");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer re_test",
      "Idempotency-Key": "reminders/2026-10-05/u1",
    });
    expect(JSON.parse(init?.body as string)).toHaveLength(1);
  });

  it("reports a refused batch as failed", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    expect(await sendBatch([email], "key")).toBe("failed");
  });
});
