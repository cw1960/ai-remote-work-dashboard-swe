"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { isPreviewHost } from "@/lib/jobs/outbound";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { type Candidate, classifyListing, type Outcome } from "./dedupe";
import { isAdmin } from "./queries";
import { listingSchema } from "./schema";

export type SaveListingResult =
  | { ok: true; outcome: Outcome["kind"]; match: string | null }
  | {
      ok: false;
      error: "invalid" | "forbidden" | "preview" | "failed";
      fields?: string[];
      /** Country names the form could not recognise. */
      unknownCountries?: string[];
    };

export type ListingActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "forbidden" | "preview" | "failed" };

/**
 * Deploy previews share the production database, so admin changes made
 * there are refused.
 */
async function onPreview(): Promise<boolean> {
  const request = await headers();
  return isPreviewHost(request.get("x-forwarded-host") ?? request.get("host"));
}

function revalidate() {
  revalidatePath("/[locale]/admin/listings", "page");
}

/**
 * Checks a hand-picked listing against stored jobs, then saves it as new,
 * updates the listing it repeats, saves it for review, or refuses it as a
 * duplicate.
 */
export async function saveListing(input: unknown): Promise<SaveListingResult> {
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) {
    const unknown = parsed.error.issues.flatMap((issue) =>
      issue.code === "custom"
        ? (z.array(z.string()).safeParse(issue.params?.unknown).data ?? [])
        : [],
    );
    return {
      ok: false,
      error: "invalid",
      fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))],
      ...(unknown.length > 0 ? { unknownCountries: unknown } : {}),
    };
  }
  if (await onPreview()) return { ok: false, error: "preview" };
  if (!(await isAdmin())) return { ok: false, error: "forbidden" };
  const listing = parsed.data;
  const supabase = await createSupabaseServerClient();

  // A typed company name that is already a platform is that platform.
  let platformId = listing.platformId;
  if (platformId === null && listing.platformName !== null) {
    const platforms = await supabase.rpc("admin_platforms");
    if (platforms.error) return { ok: false, error: "failed" };
    const name = listing.platformName.toLowerCase();
    platformId =
      platforms.data.find((p) => p.name.toLowerCase() === name)?.id ?? null;
  }

  const candidates = await supabase.rpc("admin_listing_candidates", {
    // An unknown id matches no platform: only the address is compared.
    p_platform_id: platformId ?? "00000000-0000-0000-0000-000000000000",
    p_url: listing.url,
  });
  if (candidates.error) {
    console.error("listing candidates failed", candidates.error);
    return { ok: false, error: "failed" };
  }
  const outcome = classifyListing(
    { ...listing, platformId },
    candidates.data satisfies Candidate[],
  );

  const fields = {
    p_title: listing.title,
    p_url: listing.url,
    p_summary: listing.summary ?? "",
    p_pay_min: listing.payMin,
    p_pay_max: listing.payMax,
    p_pay_unit: listing.payUnit,
    p_countries: listing.countries,
    p_posted_at: listing.postedAt,
    p_verified_at: listing.verifiedAt,
  };

  if (outcome.kind === "duplicate") {
    return { ok: true, outcome: "duplicate", match: outcome.match.title };
  }
  if (outcome.kind === "updated") {
    const { data, error } = await supabase.rpc("admin_update_listing", {
      p_job_id: outcome.match.id,
      ...fields,
    });
    if (error || !data) {
      console.error("listing not updated", error);
      return { ok: false, error: "failed" };
    }
    revalidate();
    return { ok: true, outcome: "updated", match: outcome.match.title };
  }

  const { error } = await supabase.rpc("admin_save_listing", {
    p_platform_id: platformId,
    p_platform_name: listing.platformName ?? "",
    ...fields,
    p_review_of: outcome.kind === "uncertain" ? outcome.match.id : null,
  });
  if (error) {
    console.error("listing not saved", error);
    return { ok: false, error: "failed" };
  }
  revalidate();
  return {
    ok: true,
    outcome: outcome.kind,
    match: outcome.kind === "uncertain" ? outcome.match.title : null,
  };
}

const idSchema = z.uuid();

/** Closes a hand-picked listing that is no longer open. */
export async function closeListing(
  input: unknown,
): Promise<ListingActionResult> {
  const id = idSchema.safeParse(input);
  if (!id.success) return { ok: false, error: "invalid" };
  if (await onPreview()) return { ok: false, error: "preview" };
  if (!(await isAdmin())) return { ok: false, error: "forbidden" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_close_listing", {
    p_job_id: id.data,
  });
  if (error || !data) return { ok: false, error: "failed" };
  revalidate();
  return { ok: true };
}

const resolveSchema = z.object({ id: z.uuid(), keep: z.boolean() });

/** An "uncertain" listing: keep it (not a repeat) or drop it (a repeat). */
export async function resolveListing(
  input: unknown,
): Promise<ListingActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (await onPreview()) return { ok: false, error: "preview" };
  if (!(await isAdmin())) return { ok: false, error: "forbidden" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_resolve_listing", {
    p_job_id: parsed.data.id,
    p_keep: parsed.data.keep,
  });
  if (error || !data) return { ok: false, error: "failed" };
  revalidate();
  return { ok: true };
}
