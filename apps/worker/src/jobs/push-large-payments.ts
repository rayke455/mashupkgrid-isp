import { prisma } from "@mashupkgrid/database";
import { resolveTenantPreferences, type AutomationSummary } from "@mashupkgrid/shared";
import { isPushConfigured, pushToTenantStaff } from "@mashupkgrid/push";
import { redis } from "../lib/redis.js";
import { formatMoney } from "../lib/format.js";

/**
 * Tells an ISP's staff, on the devices where they turned alerts on, when a payment at or above
 * the ISP's alert amount arrives. Payments are recorded as completed when they are created, so
 * each minute this looks back over the last two hours and alerts once per payment: a Redis key
 * per alerted payment makes a retried or overlapping run harmless.
 */

const LOOKBACK_MS = 2 * 60 * 60 * 1000;
/** The smallest alert amount a tenant can set (KES 100); nothing below it can ever qualify. */
const FLOOR_MINOR = 10_000;
const SENT_KEY = (paymentId: string) => `push:large-payment:${paymentId}`;

export async function handlePushLargePayments(): Promise<AutomationSummary> {
  if (!isPushConfigured()) return { checked: 0, alerted: 0 };

  const payments = await prisma.payment.findMany({
    where: { status: "COMPLETED", reversedAt: null, amountMinor: { gte: FLOOR_MINOR }, createdAt: { gte: new Date(Date.now() - LOOKBACK_MS) } },
    orderBy: { createdAt: "asc" },
    take: 2000,
    select: {
      id: true,
      tenantId: true,
      amountMinor: true,
      currency: true,
      method: true,
      reference: true,
      customer: { select: { id: true, fullName: true } },
    },
  });

  const thresholds = new Map<string, number>();
  const thresholdFor = async (tenantId: string): Promise<number> => {
    if (!thresholds.has(tenantId)) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { preferences: true } });
      thresholds.set(tenantId, resolveTenantPreferences(tenant?.preferences).alerts.largePaymentMinor);
    }
    return thresholds.get(tenantId)!;
  };

  let alerted = 0;
  for (const payment of payments) {
    const threshold = await thresholdFor(payment.tenantId);
    if (threshold === 0 || payment.amountMinor < threshold) continue;
    // Claim the payment before sending: if two runs overlap, only one gets "OK".
    const claimed = await redis.set(SENT_KEY(payment.id), "1", "EX", 3 * 24 * 60 * 60, "NX");
    if (claimed !== "OK") continue;

    const who = payment.customer?.fullName ?? "a hotspot buyer";
    const ref = payment.reference ? ` (${payment.method === "MPESA" ? "M-Pesa " : ""}${payment.reference})` : "";
    try {
      await pushToTenantStaff(payment.tenantId, "payments.read", {
        title: `Payment received: ${formatMoney(payment.amountMinor, payment.currency)}`,
        body: `From ${who}${ref}.`,
        url: payment.customer ? `/customers/${payment.customer.id}` : "/payments",
        tag: `payment-${payment.id}`,
      });
      alerted += 1;
    } catch (err) {
      console.error(`[push] large-payment alert for ${payment.id} failed`, err);
    }
  }
  return { checked: payments.length, alerted };
}
