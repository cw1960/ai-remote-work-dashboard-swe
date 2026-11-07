import { z } from "zod";

import { MEMBERSHIP_STATUSES } from "@/lib/profile/schema";

/** One Platform Passport change: a status and, when rejected, a reapply day. */
export const passportUpdateSchema = z.object({
  platform: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  status: z.enum(MEMBERSHIP_STATUSES),
  reapplyAfter: z.iso.date().nullable().optional(),
});
export type PassportUpdate = z.infer<typeof passportUpdateSchema>;
