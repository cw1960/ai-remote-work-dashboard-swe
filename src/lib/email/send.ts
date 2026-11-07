import "server-only";

import { z } from "zod";

import { siteConfig } from "@/config/site";
import { getServerEnv } from "@/lib/env";

/** One rendered email, ready for Resend. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** One-click unsubscribe URL (RFC 8058); also shown in the email. */
  unsubscribeUrl?: string;
}

const RESEND_URL = "https://api.resend.com";
/** Resend's batch endpoint takes at most 100 emails per request. */
export const BATCH_SIZE = 100;

const batchResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

/** The JSON body Resend expects for one email. */
export function toResendEmail(email: OutgoingEmail) {
  return {
    from: `${siteConfig.name} <${siteConfig.senderAddress}>`,
    to: [email.to],
    reply_to: siteConfig.supportEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    ...(email.unsubscribeUrl
      ? {
          headers: {
            "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  };
}

export type SendResult = "sent" | "skipped" | "failed";

/**
 * Sends up to 100 emails in one Resend request. Without RESEND_API_KEY
 * (deploy previews, local, CI) nothing is sent: "skipped". The idempotency
 * key makes a retried request send nothing twice.
 */
export async function sendBatch(
  emails: readonly OutgoingEmail[],
  idempotencyKey: string,
): Promise<SendResult> {
  if (emails.length === 0) return "sent";
  if (emails.length > BATCH_SIZE) throw new Error("batch too large");
  const { RESEND_API_KEY } = getServerEnv();
  if (!RESEND_API_KEY) return "skipped";

  try {
    const response = await fetch(`${RESEND_URL}/emails/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify(emails.map(toResendEmail)),
    });
    if (!response.ok) {
      console.error(
        "email batch refused",
        response.status,
        await response.text(),
      );
      return "failed";
    }
    batchResponseSchema.parse(await response.json());
    return "sent";
  } catch (error) {
    console.error("email batch not sent", error);
    return "failed";
  }
}
