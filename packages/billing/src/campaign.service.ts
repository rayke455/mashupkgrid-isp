import { prisma, Prisma, type Campaign } from "@mashupkgrid/database";
import { campaignAudienceSchema, type CampaignAudience } from "@mashupkgrid/shared";

/**
 * Campaigns: one message to a group of customers. The audience is resolved when sending starts
 * (so it is who matches then, not when the campaign was written), each recipient gets their own
 * copy with their name and balance filled in, and payments in the days after are counted as the
 * campaign's result.
 */

const DAY = 86_400_000;


export interface AudienceMember {
  customerId: string;
  fullName: string;
  phone: string;
  customerNumber: string;
  owedMinor: number;
}

/** Everyone the audience matches right now, with what they owe. */
export async function resolveCampaignAudience(tenantId: string, audience: CampaignAudience): Promise<AudienceMember[]> {
  const now = new Date();
  const serviceFilter: Prisma.CustomerServiceWhereInput = { ...(audience.packageId ? { packageId: audience.packageId } : {}) };
  const where: Prisma.CustomerWhereInput = { tenantId, deletedAt: null, ...(audience.branchId ? { branchId: audience.branchId } : {}) };
  switch (audience.segment) {
    case "ACTIVE":
      where.services = { some: { ...serviceFilter, status: "ACTIVE" } };
      break;
    case "SUSPENDED":
      // A paused plan is suspended on purpose; those customers aren't behind on anything.
      where.services = { some: { ...serviceFilter, status: "SUSPENDED", pausedUntil: null } };
      break;
    case "OVERDUE":
      where.invoices = { some: { status: "OVERDUE" } };
      if (audience.packageId) where.services = { some: serviceFilter };
      break;
    case "INACTIVE":
      where.payments = { none: { status: "COMPLETED", createdAt: { gte: new Date(now.getTime() - audience.inactiveDays * DAY) } } };
      if (audience.packageId) where.services = { some: serviceFilter };
      break;
    case "ALL":
      if (audience.packageId) where.services = { some: serviceFilter };
      break;
  }
  const customers = await prisma.customer.findMany({ where, select: { id: true, fullName: true, phone: true, customerNumber: true }, orderBy: { createdAt: "asc" } });
  if (!customers.length) return [];
  const owed = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customers.map((c) => c.id) }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
    _sum: { totalMinor: true, amountPaidMinor: true },
  });
  const owedBy = new Map(owed.map((o) => [o.customerId, (o._sum.totalMinor ?? 0) - (o._sum.amountPaidMinor ?? 0)]));
  return customers
    .filter((c) => c.phone && c.phone.replace(/\D/g, "").length >= 9)
    .map((c) => ({ customerId: c.id, fullName: c.fullName, phone: c.phone, customerNumber: c.customerNumber, owedMinor: owedBy.get(c.id) ?? 0 }));
}

/** Fills in {firstName}, {name}, {accountNumber} and {amountDue}. Unknown placeholders stay. */
export function personalizeMessage(template: string, m: Pick<AudienceMember, "fullName" | "customerNumber" | "owedMinor">, currency = "KES"): string {
  const vars: Record<string, string> = {
    firstName: m.fullName.split(/\s+/)[0] ?? m.fullName,
    name: m.fullName,
    accountNumber: m.customerNumber,
    amountDue: `${currency} ${Math.round(m.owedMinor / 100).toLocaleString("en-KE")}`,
  };
  return template.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all);
}

/** SMS parts a message takes: 160 characters for one, 153 each when split. */
export function smsParts(text: string): number {
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

/** Writes the recipient list the first time a campaign starts sending. */
export async function snapshotRecipients(campaign: Campaign): Promise<number> {
  const existing = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
  if (existing) return existing;
  const audience = campaignAudienceSchema.parse(campaign.audience);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: campaign.tenantId }, select: { currency: true } });
  const members = await resolveCampaignAudience(campaign.tenantId, audience);
  await prisma.campaignRecipient.createMany({
    data: members.map((m) => ({ campaignId: campaign.id, customerId: m.customerId, phone: m.phone, message: personalizeMessage(campaign.message, m, tenant.currency) })),
    skipDuplicates: true,
  });
  return members.length;
}

/** Records, for each recipient who has paid since their message and within the window, what
 *  they paid. Runs over campaigns still inside their window. */
export async function attributeCampaignPayments(now = new Date()): Promise<number> {
  return prisma.$executeRaw`
    UPDATE campaign_recipients r
    SET "paidMinor" = x.total, "paidAt" = x.first_at
    FROM (
      SELECT rr.id, SUM(pay."amountMinor")::int AS total, MIN(pay."createdAt") AS first_at
      FROM campaign_recipients rr
      JOIN campaigns c ON c.id = rr."campaignId"
      JOIN payments pay ON pay."customerId" = rr."customerId"
        AND pay.status = 'COMPLETED' AND pay."reversedAt" IS NULL AND pay.method <> 'WALLET'
        AND pay."createdAt" >= rr."sentAt" AND pay."createdAt" < rr."sentAt" + (c."trackDays" * interval '1 day')
      WHERE rr.status = 'SENT' AND rr."sentAt" IS NOT NULL
        AND rr."sentAt" > ${now}::timestamp - (c."trackDays" * interval '1 day') - interval '1 day'
      GROUP BY rr.id
    ) x
    WHERE r.id = x.id AND r."paidMinor" IS DISTINCT FROM x.total`;
}

/** Totals for a list of campaigns. */
export async function campaignStats(campaignIds: string[]) {
  if (!campaignIds.length) return new Map<string, { recipients: number; sent: number; failed: number; paid: number; paidMinor: number }>();
  const rows = await prisma.$queryRaw<{ campaignId: string; recipients: bigint; sent: bigint; failed: bigint; paid: bigint; paidMinor: bigint | null }[]>`
    SELECT "campaignId",
           COUNT(*) AS recipients,
           COUNT(*) FILTER (WHERE status = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
           COUNT(*) FILTER (WHERE "paidMinor" > 0) AS paid,
           SUM("paidMinor") AS "paidMinor"
    FROM campaign_recipients WHERE "campaignId" IN (${Prisma.join(campaignIds)})
    GROUP BY "campaignId"`;
  return new Map(
    rows.map((r) => [r.campaignId, { recipients: Number(r.recipients), sent: Number(r.sent), failed: Number(r.failed), paid: Number(r.paid), paidMinor: Number(r.paidMinor ?? 0) }])
  );
}
