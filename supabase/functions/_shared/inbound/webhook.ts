/**
 * Resend webhook verification. Resend signs deliveries the Svix way:
 * HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw body>", keyed with the
 * base64 secret after "whsec_", sent as space-separated "v1,<base64>"
 * values in svix-signature. Uses Web Crypto, so Deno and Node share it.
 */

/** Deliveries older (or newer) than this are refused, against replays. */
export const TOLERANCE_SECONDS = 5 * 60;

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/** Compares without leaking where the strings differ. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function signWebhook(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return toBase64(signature);
}

/** Whether a delivery is genuine and recent. `now` is in seconds. */
export async function verifyWebhook(
  secret: string,
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  },
  body: string,
  now: number,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  let expected: string;
  try {
    expected = await signWebhook(secret, id, timestamp, body);
  } catch {
    return false;
  }
  return signature
    .split(" ")
    .some(
      (part) => part.startsWith("v1,") && safeEqual(part.slice(3), expected),
    );
}
