import { describe, expect, it } from "vitest";

import { stripeForm } from "./stripe-form";

describe("stripeForm", () => {
  it("encodes nested objects and arrays the way Stripe expects", () => {
    const body = new URLSearchParams(
      stripeForm({
        mode: "payment",
        allow_promotion_codes: true,
        skipped: undefined,
        line_items: [
          { quantity: 1, price_data: { unit_amount: 1900, currency: "usd" } },
        ],
        metadata: { product: "playbook" },
      }),
    );
    expect([...body.entries()]).toEqual([
      ["mode", "payment"],
      ["allow_promotion_codes", "true"],
      ["line_items[0][quantity]", "1"],
      ["line_items[0][price_data][unit_amount]", "1900"],
      ["line_items[0][price_data][currency]", "usd"],
      ["metadata[product]", "playbook"],
    ]);
  });
});
