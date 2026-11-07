"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { safeNextPath } from "./next-path";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; code: "invalid" | "rate_limited" | "failed" };

const signInSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  next: z.string().max(500).nullish(),
});

/** This request's own origin, so the link returns to the same site. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

/**
 * Emails a magic link. Supabase only redirects to URLs on its allow-list
 * (Auth → URL Configuration), falling back to the Site URL otherwise.
 */
export async function requestMagicLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };

  const { email, next } = parsed.data;
  const callback = new URL("/auth/confirm", await requestOrigin());
  callback.searchParams.set("next", safeNextPath(next));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  });

  if (!error) return { status: "sent", email };
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return { status: "error", code: "rate_limited" };
  }
  if (error.code === "email_address_invalid") {
    return { status: "error", code: "invalid" };
  }
  console.error("magic link not sent", error.code, error.message);
  return { status: "error", code: "failed" };
}
