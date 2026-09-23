import { prisma, type PlatformSettlementSettings, type Prisma } from "@mashupkgrid/database";
import { ValidationError } from "@mashupkgrid/shared";
import type { Db } from "./common.js";
import type { FeeRule } from "./fees.js";

const SINGLETON_ID = "platform";

/** Read with a fallback row so a fresh install (before a super admin saves anything) behaves as
 *  "gateway off, no fee, manual daily" rather than throwing. The migration creates the row. */
export async function getSettlementSettings(db: Db = prisma): Promise<PlatformSettlementSettings> {
  const existing = await db.platformSettlementSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return db.platformSettlementSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

export interface UpdateSettlementSettingsInput {
  gatewayEnabled?: boolean;
  feePercentBps?: number;
  feeFixedMinor?: number;
  settlementMode?: PlatformSettlementSettings["settlementMode"];
  settlementFrequency?: PlatformSettlementSettings["settlementFrequency"];
  settlementMinimumMinor?: number;
  settlementHourEat?: number;
  settlementWeekday?: number;
}

export async function updateSettlementSettings(
  input: UpdateSettlementSettingsInput,
  userId: string
): Promise<{ before: PlatformSettlementSettings; after: PlatformSettlementSettings }> {
  if (input.settlementMinimumMinor !== undefined && input.settlementMinimumMinor % 100 !== 0) {
    // M-Pesa moves whole shillings; a minimum with cents would never be exactly reachable.
    throw new ValidationError("The minimum settlement must be a whole number of shillings");
  }
  const before = await getSettlementSettings();
  const data: Prisma.PlatformSettlementSettingsUpdateInput = { ...input, updatedByUserId: userId };
  const after = await prisma.platformSettlementSettings.update({ where: { id: SINGLETON_ID }, data });
  return { before, after };
}

/** The fee that applies to this tenant right now: their override if one is set, else the
 *  platform default. Each part overrides independently. */
export async function getEffectiveFeeRule(db: Db, tenantId: string, settings?: PlatformSettlementSettings): Promise<FeeRule> {
  const [tenant, platform] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { feePercentBpsOverride: true, feeFixedMinorOverride: true },
    }),
    settings ? Promise.resolve(settings) : getSettlementSettings(db),
  ]);
  return {
    percentBps: tenant?.feePercentBpsOverride ?? platform.feePercentBps,
    fixedMinor: tenant?.feeFixedMinorOverride ?? platform.feeFixedMinor,
  };
}
