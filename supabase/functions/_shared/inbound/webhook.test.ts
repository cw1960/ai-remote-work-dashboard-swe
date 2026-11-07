import { describe, expect, it } from "vitest";

import { signWebhook, verifyWebhook } from "./webhook.ts";

const SECRET = `whsec_${btoa("a test secret of 24 bytes")}`;
const BODY = '{"type":"email.received"}';
const NOW = 1_790_000_000;

async function headers(body = BODY, at = NOW) {
  const signature = await signWebhook(SECRET, "msg_1", String(at), body);
  return { id: "msg_1", timestamp: String(at), signature: `v1,${signature}` };
}

describe("verifyWebhook", () => {
  it("accepts a correctly signed, recent delivery", async () => {
    expect(await verifyWebhook(SECRET, await headers(), BODY, NOW)).toBe(true);
  });

  it("accepts any matching signature among several", async () => {
    const h = await headers();
    expect(
      await verifyWebhook(
        SECRET,
        { ...h, signature: `v1,bm9wZQ== ${h.signature}` },
        BODY,
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects a changed body, a wrong secret and missing headers", async () => {
    const h = await headers();
    expect(await verifyWebhook(SECRET, h, `${BODY} `, NOW)).toBe(false);
    expect(
      await verifyWebhook(`whsec_${btoa("another secret")}`, h, BODY, NOW),
    ).toBe(false);
    expect(
      await verifyWebhook(SECRET, { ...h, signature: null }, BODY, NOW),
    ).toBe(false);
  });

  it("rejects old deliveries (replays)", async () => {
    const h = await headers(BODY, NOW - 600);
    expect(await verifyWebhook(SECRET, h, BODY, NOW)).toBe(false);
  });
});
