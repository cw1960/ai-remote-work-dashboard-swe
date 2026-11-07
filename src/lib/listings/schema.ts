/**
 * The hand-picked listing form (owner-only, newsletter N3). Validated on the
 * server before anything is compared or stored.
 */
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import {
  ALPHA3_TO_ALPHA2,
  countriesFromLocation,
} from "../../../supabase/functions/_shared/ingest/countries";

export type PayUnit = Database["public"]["Enums"]["pay_unit"];

export const PAY_UNITS = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "task",
  "session",
  "project",
] as const satisfies readonly PayUnit[];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const optionalAmount = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const amount = Number(value.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount > 99_999_999) {
      ctx.addIssue({ code: "custom", message: "amount" });
      return z.NEVER;
    }
    return Math.round(amount * 100) / 100;
  });

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
  .transform((value) => (value === "" ? null : `${value}T00:00:00Z`));

const ALPHA2 = new Set(Object.values(ALPHA3_TO_ALPHA2));

/** One country, by English name ("Mexico", "United States", "UK") or code. */
function countryCode(entry: string): string | null {
  const code = entry.toUpperCase();
  if (/^[A-Z]{2}$/.test(code) && ALPHA2.has(code)) return code;
  return countriesFromLocation(entry)[0] ?? null;
}

/**
 * "United States, Mexico; uk" → ["GB", "MX", "US"]; empty (or "Anywhere")
 * means open to everyone. Names that aren't recognised are reported back.
 */
export const countryList = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const entries = value
      .split(/[,;\n]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    if (entries.some((entry) => /^(anywhere|worldwide|global)$/i.test(entry))) {
      return [];
    }
    const codes = new Set<string>();
    const unknown: string[] = [];
    for (const entry of entries) {
      const code = countryCode(entry);
      if (code) codes.add(code);
      else unknown.push(entry);
    }
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "countries",
        params: { unknown },
      });
      return z.NEVER;
    }
    return [...codes].sort();
  });

export const listingSchema = z
  .object({
    platformId: z.union([z.uuid(), z.literal("")]),
    platformName: optionalText(100),
    title: z.string().trim().min(1).max(300),
    url: z.url({ protocol: /^https$/ }).max(2000),
    summary: optionalText(500),
    payMin: optionalAmount,
    payMax: optionalAmount,
    payUnit: z.union([z.enum(PAY_UNITS), z.literal("")]),
    countries: countryList,
    postedAt: optionalDate,
    verifiedAt: optionalDate,
  })
  .refine((l) => l.platformId !== "" || l.platformName !== null, {
    path: ["platformName"],
    message: "company",
  })
  .refine(
    (l) => l.payMin === null || l.payMax === null || l.payMin <= l.payMax,
    { path: ["payMax"], message: "pay" },
  )
  .refine((l) => (l.payMin === null && l.payMax === null) || l.payUnit !== "", {
    path: ["payUnit"],
    message: "unit",
  })
  .transform((l) => ({
    ...l,
    platformId: l.platformId === "" ? null : l.platformId,
    payUnit: l.payUnit === "" ? null : l.payUnit,
  }));

export type Listing = z.output<typeof listingSchema>;
