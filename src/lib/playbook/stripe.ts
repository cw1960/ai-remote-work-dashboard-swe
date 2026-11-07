import "server-only";

import { z } from "zod";

import { playbookConfig } from "@/config/playbook";
import { getServerEnv } from "@/lib/env";

import { type PurchaseStatus, purchaseStatus } from "./purchase";
import { stripeForm } from "./stripe-form";

/**
 * The few Stripe API calls the Playbook needs, over plain fetch (no SDK):
 * create a Checkout Session, and read one back to check a purchase.
 */

const API = "https://api.stripe.com/v1";

/** A Checkout Session id as Stripe issues them. */
export const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

const createdSchema = z.object({ id: z.string(), url: z.url() });

const sessionSchema = z.object({
  id: z.string(),
  created: z.number(),
  status: z.string().nullable(),
  payment_status: z.string(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
  customer_details: z
    .object({ email: z.string().nullable().optional() })
    .nullable()
    .optional(),
  payment_intent: z
    .object({
      latest_charge: z
        .object({
          refunded: z.boolean(),
          disputed: z.boolean().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export type CheckoutSession = z.infer<typeof sessionSchema>;

export class StripeUnavailableError extends Error {
  override name = "StripeUnavailableError";
}

function secretKey(): string {
  const key = getServerEnv().STRIPE_SECRET_KEY;
  if (!key) throw new StripeUnavailableError("STRIPE_SECRET_KEY is not set");
  return key;
}

/** True when checkout can run (the secret key is configured). */
export function checkoutEnabled(): boolean {
  return Boolean(getServerEnv().STRIPE_SECRET_KEY);
}

/**
 * A Checkout Session for one copy of the Playbook; returns its URL. `ref`
 * (where the buyer came from) is kept in the metadata for reporting.
 */
export async function createCheckoutSession(
  ref: string | null = null,
): Promise<string> {
  const metadata = ref ? { product: "playbook", ref } : { product: "playbook" };
  const base = playbookConfig.url;
  const body = stripeForm({
    mode: "payment",
    success_url: `${base}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancelled`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: playbookConfig.currency,
          unit_amount: playbookConfig.priceCents,
          product_data: {
            name: playbookConfig.title,
            tax_code: playbookConfig.taxCode,
            description: `PDF ebook by ${playbookConfig.author}. ${playbookConfig.subtitle}.`,
          },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata },
  });
  const response = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Stripe refused the session: HTTP ${String(response.status)} ${await stripeError(response)}`,
    );
  }
  return createdSchema.parse(await response.json()).url;
}

const errorSchema = z.object({
  error: z.object({
    type: z.string().optional(),
    code: z.string().optional(),
    param: z.string().optional(),
    message: z.string().optional(),
  }),
});

/** Stripe's error type, code and message, for the logs (no secrets). */
async function stripeError(response: Response): Promise<string> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return "(no error details)";
  const { type, code, param, message } = parsed.data.error;
  return [type, code, param && `param=${param}`, message]
    .filter(Boolean)
    .join(" | ");
}

/** A Checkout Session with its charge, or null when Stripe doesn't know it. */
export async function getCheckoutSession(
  id: string,
): Promise<CheckoutSession | null> {
  if (!SESSION_ID.test(id)) return null;
  const response = await fetch(
    `${API}/checkout/sessions/${id}?expand[]=payment_intent.latest_charge`,
    { headers: { Authorization: `Bearer ${secretKey()}` }, cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Stripe session lookup failed: HTTP ${response.status}`);
  }
  return sessionSchema.parse(await response.json());
}

/**
 * Whether a session id is a Playbook purchase that may download now, with
 * the buyer's email. Unknown ids, and Stripe being unreachable, count as
 * unpaid (the thank-you page then explains how to get help).
 */
export async function checkPurchase(
  sessionId: string,
): Promise<{ status: PurchaseStatus; email: string | null }> {
  let session: CheckoutSession | null = null;
  try {
    session = await getCheckoutSession(sessionId);
  } catch (error) {
    if (!(error instanceof StripeUnavailableError)) {
      console.error("playbook purchase check failed", error);
    }
  }
  if (!session) return { status: "unpaid", email: null };
  return {
    status: purchaseStatus(session, Date.now(), playbookConfig.downloadDays),
    email: session.customer_details?.email ?? null,
  };
}
