/**
 * The onboarding profile: what each step saves, validated with the same
 * limits as the `profiles` and `platform_memberships` tables. Shared by the
 * client form (field limits) and the server action (the real check).
 */
import { z } from "zod";

import { DOMAINS } from "@/lib/jobs/filters";

export const HOURS_OPTIONS = [5, 10, 20, 40] as const;

export const MEMBERSHIP_STATUSES = [
  "not_joined",
  "applied",
  "interviewing",
  "active",
  "rejected",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const MAX_SKILLS = 20;

/** "contract review, Python" → ["contract review", "Python"] */
export function parseSkills(input: string): string[] {
  const skills = input
    .split(",")
    .map((skill) => skill.replace(/\s+/g, " ").trim())
    .filter((skill) => skill.length > 0)
    .map((skill) => skill.slice(0, 60));
  return [...new Set(skills)].slice(0, MAX_SKILLS);
}

export const onboardingStepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("expertise"),
    domains: z.array(z.enum(DOMAINS)).max(DOMAINS.length),
    skills: z.array(z.string().min(1).max(60)).max(MAX_SKILLS),
  }),
  z.object({
    step: z.literal("languages"),
    languages: z.array(z.string().regex(/^[a-z]{2}$/)).max(30),
  }),
  z.object({
    step: z.literal("location"),
    country: z.string().regex(/^[A-Z]{2}$/),
  }),
  z.object({
    step: z.literal("availability"),
    hoursPerWeek: z.number().int().min(1).max(168),
    targetRate: z.number().min(1).max(10_000).nullable(),
  }),
  z.object({
    step: z.literal("platforms"),
    statuses: z.record(
      z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      z.enum(MEMBERSHIP_STATUSES),
    ),
  }),
]);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;
export type OnboardingStepName = OnboardingStep["step"];

export const STEP_ORDER: readonly OnboardingStepName[] = [
  "expertise",
  "languages",
  "location",
  "availability",
  "platforms",
];

/** Board column for a platform the user already joined, or none. */
export function stageForMembership(
  status: MembershipStatus,
): "applied" | "interviewing" | "offered" | "rejected" | null {
  switch (status) {
    case "applied":
      return "applied";
    case "interviewing":
      return "interviewing";
    case "active":
      return "offered";
    case "rejected":
      return "rejected";
    case "not_joined":
      return null;
  }
}
