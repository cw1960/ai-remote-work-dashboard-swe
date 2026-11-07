import { describe, expect, it, vi } from "vitest";

import {
  buildAlertEmail,
  DEFAULT_ALERT_FROM,
  RESEND_EMAILS_URL,
  sendAlert,
} from "./alert.ts";

const report = {
  platform: "mercor",
  requests: 1,
  run_id: 42,
  found: 0,
  skipped: 0,
  error: "MercorLayoutError: Explore page has no __NEXT_DATA__ script",
};

describe("buildAlertEmail", () => {
  it("names the platform, the run and the error", () => {
    const email = buildAlertEmail(report);
    expect(email.subject).toBe("Ingestion failed: mercor");
    expect(email.text).toContain("run #42");
    expect(email.text).toContain(report.error);
    expect(email.text).toContain("No jobs were closed");
  });
});

describe("sendAlert", () => {
  it("posts the email to Resend", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("{}")));
    await sendAlert(
      fetchFn,
      { apiKey: "re_test", to: "owner@example.com", from: DEFAULT_ALERT_FROM },
      report,
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(RESEND_EMAILS_URL);
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: DEFAULT_ALERT_FROM,
      to: ["owner@example.com"],
      subject: "Ingestion failed: mercor",
    });
  });

  it("reports a Resend error", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response("nope", { status: 403 })),
    );
    await expect(
      sendAlert(fetchFn, { apiKey: "k", to: "a@b.c", from: "x" }, report),
    ).rejects.toThrow("HTTP 403");
  });
});
