import { z } from "zod";

/** Who a campaign goes to. Resolved when sending starts. */
export const campaignAudienceSchema = z.object({
  segment: z.enum(["ACTIVE", "SUSPENDED", "OVERDUE", "INACTIVE", "ALL"]),
  branchId: z.string().uuid().nullish(),
  packageId: z.string().uuid().nullish(),
  /** For INACTIVE: no payment in this many days. */
  inactiveDays: z.number().int().min(7).max(365).default(30),
});
export type CampaignAudience = z.infer<typeof campaignAudienceSchema>;
