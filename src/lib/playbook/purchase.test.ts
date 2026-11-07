import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isSettled, purchaseStatus, verifyStripeSignature } from "./purchase";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const created = (daysAgo: number) =>
  Math.floor((NOW - daysAgo * 86_400_000) / 1000);

const paid = {
  created: created(1),
  payment_status: "paid",
  metadata: { product: "playbook" },
  payment_intent: { latest_charge: { refunded: false, disputed: false } },
};

describe("purchaseStatus", () => {
  it("grants a paid Playbook purchase", () => {
    expect(purchaseStatus(paid, NOW, 90)).toBe("paid");
  });

  it("refuses unpaid sessions and other products", () => {
    expect(purchaseStatus({ ...paid, payment_status: "unpaid" }, NOW, 90)).toBe(
      "unpaid",
    );
    expect(
      purchaseStatus({ ...paid, metadata: { product: "other" } }, NOW, 90),
    ).toBe("unpaid");
    expect(purchaseStatus({ ...paid, metadata: null }, NOW, 90)).toBe("unpaid");
  });

  it("grants a completed order that needed no payment (100%-off code)", () => {
    const free = {
      created: created(1),
      status: "complete",
      payment_status: "no_payment_required",
      metadata: { product: "playbook" },
      payment_intent: null,
    };
    expect(purchaseStatus(free, NOW, 90)).toBe("paid");
    expect(purchaseStatus({ ...free, status: "open" }, NOW, 90)).toBe("unpaid");
    expect(purchaseStatus({ ...free, status: undefined }, NOW, 90)).toBe(
      "unpaid",
    );
    expect(purchaseStatus({ ...free, created: created(91) }, NOW, 90)).toBe(
      "expired",
    );
  });

  it("stops refunded or disputed purchases", () => {
    expect(
      purchaseStatus(
        { ...paid, payment_intent: { latest_charge: { refunded: true } } },
        NOW,
        90,
      ),
    ).toBe("refunded");
    expect(
      purchaseStatus(
        {
          ...paid,
          payment_intent: {
            latest_charge: { refunded: false, disputed: true },
          },
        },
        NOW,
        90,
      ),
    ).toBe("refunded");
  });

  it("expires the download after the window", () => {
    expect(purchaseStatus({ ...paid, created: created(89) }, NOW, 90)).toBe(
      "paid",
    );
    expect(purchaseStatus({ ...paid, created: created(91) }, NOW, 90)).toBe(
      "expired",
    );
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const t = 1_760_000_000;
  const sign = (payload: string, timestamp = t, key = secret) =>
    createHmac("sha256", key)
      .update(`${String(timestamp)}.${payload}`)
      .digest("hex");

  it("accepts a valid signature", () => {
    expect(
      verifyStripeSignature(body, `t=${String(t)},v1=${sign(body)}`, secret, t),
    ).toBe(true);
  });

  it("accepts any matching v1 among several", () => {
    const header = `t=${String(t)},v1=${"0".repeat(64)},v1=${sign(body)}`;
    expect(verifyStripeSignature(body, header, secret, t + 10)).toBe(true);
  });

  it("rejects a changed body, wrong secret, old timestamp or no header", () => {
    const header = `t=${String(t)},v1=${sign(body)}`;
    expect(verifyStripeSignature('{"id":"evt_2"}', header, secret, t)).toBe(
      false,
    );
    expect(verifyStripeSignature(body, header, "whsec_other", t)).toBe(false);
    expect(verifyStripeSignature(body, header, secret, t + 301)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, t)).toBe(false);
    expect(verifyStripeSignature(body, "v1=abc", secret, t)).toBe(false);
  });
});

describe("isSettled", () => {
  it("accepts paid sessions and completed no-payment sessions only", () => {
    expect(isSettled("paid", null)).toBe(true);
    expect(isSettled("no_payment_required", "complete")).toBe(true);
    expect(isSettled("no_payment_required", "open")).toBe(false);
    expect(isSettled("unpaid", "complete")).toBe(false);
    expect(isSettled(undefined, "complete")).toBe(false);
  });
});
