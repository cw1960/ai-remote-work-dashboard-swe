import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure purchase rules (no network), shared by the thank-you page, the
 * download route and the webhook.
 */

export type PurchaseStatus = "paid" | "unpaid" | "refunded" | "expired";

export interface SessionFacts {
  /** Unix seconds. */
  created: number;
  /** The Checkout Session's own state ("open", "complete", "expired"). */
  status?: string | null | undefined;
  payment_status: string;
  metadata?: Record<string, string> | null | undefined;
  payment_intent?:
    | {
        latest_charge?:
          | { refunded: boolean; disputed?: boolean | undefined }
          | null
          | undefined;
      }
    | null
    | undefined;
}

/**
 * Whether a session's payment is settled: paid, or a completed order that
 * needed no payment (a 100%-off promotion code, such as the newsletter's
 * referral reward).
 */
export function isSettled(
  paymentStatus: string | undefined,
  status: string | null | undefined,
): boolean {
  if (paymentStatus === "paid") return true;
  return paymentStatus === "no_payment_required" && status === "complete";
}

/** Whether a Checkout Session grants the download right now. */
export function purchaseStatus(
  session: SessionFacts,
  now: number,
  downloadDays: number,
): PurchaseStatus {
  if (session.metadata?.product !== "playbook") return "unpaid";
  if (!isSettled(session.payment_status, session.status)) return "unpaid";
  const charge = session.payment_intent?.latest_charge;
  if (charge?.refunded || charge?.disputed) return "refunded";
  const ageDays = (now - session.created * 1000) / 86_400_000;
  return ageDays > downloadDays ? "expired" : "paid";
}

/** How old a webhook signature may be (Stripe's default tolerance). */
const TOLERANCE_SECONDS = 300;

/**
 * Checks a `Stripe-Signature` header ("t=…,v1=…") against the raw body:
 * HMAC-SHA256 of "<t>.<body>" with the endpoint's signing secret.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
): boolean {
  if (!header) return false;
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  if (!Number.isInteger(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret)
    .update(`${String(timestamp)}.${payload}`)
    .digest();
  return parts
    .filter(([key]) => key === "v1")
    .some(([, value]) => {
      const given = Buffer.from(value ?? "", "hex");
      return (
        given.length === expected.length && timingSafeEqual(given, expected)
      );
    });
}
