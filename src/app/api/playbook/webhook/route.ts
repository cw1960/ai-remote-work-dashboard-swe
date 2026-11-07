import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { playbookConfig } from "@/config/playbook";
import { playbookPurchaseEmail } from "@/lib/email/messages";
import { sendBatch } from "@/lib/email/send";
import { getServerEnv } from "@/lib/env";
import { isSettled, verifyStripeSignature } from "@/lib/playbook/purchase";

/**
 * POST /api/playbook/webhook — Stripe's events for the Playbook. A
 * completed, paid (or 100%-off) checkout emails the buyer their download link (once: the
 * email's idempotency key is the session id, so Stripe's retries resend
 * nothing). The email only links to the thank-you page, which checks the
 * purchase with Stripe again.
 */

const eventSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.object({
      id: z.string(),
      status: z.string().nullable().optional(),
      payment_status: z.string().optional(),
      metadata: z.record(z.string(), z.string()).nullable().optional(),
      customer_details: z
        .object({ email: z.string().nullable().optional() })
        .nullable()
        .optional(),
    }),
  }),
});

const PAID_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function POST(request: NextRequest) {
  const secret = getServerEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const payload = await request.text();
  const valid = verifyStripeSignature(
    payload,
    request.headers.get("stripe-signature"),
    secret,
    Math.floor(Date.now() / 1000),
  );
  if (!valid) return NextResponse.json({ error: "signature" }, { status: 400 });

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const event = eventSchema.safeParse(json);
  if (!event.success) return NextResponse.json({ received: true });
  const session = event.data.data.object;
  const email = session.customer_details?.email;
  if (
    !PAID_EVENTS.has(event.data.type) ||
    session.metadata?.product !== "playbook" ||
    !isSettled(session.payment_status, session.status) ||
    !email
  ) {
    return NextResponse.json({ received: true });
  }

  const message = await playbookPurchaseEmail({
    to: email,
    thanksUrl: `${playbookConfig.url}/thanks?session_id=${encodeURIComponent(session.id)}`,
  });
  const result = await sendBatch([message], `playbook-${session.id}`);
  if (result === "failed") {
    // Stripe retries the event; the idempotency key prevents duplicates.
    return NextResponse.json({ error: "email" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
