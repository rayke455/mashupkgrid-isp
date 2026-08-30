import { prisma } from "@mashupkgrid/database";

const GRACE_PERIOD_DAYS = 3;

/**
 * Two-stage subscription-lifecycle sweep — same registration/cadence as the original blunt
 * "trial passed -> suspend" job (JOB_NAMES.expireTrials, hourly), now aware of paid periods too:
 *
 * Stage 1: TRIALING or ACTIVE subscriptions whose currentPeriodEnd has passed move to PAST_DUE
 * with a grace period, plus a reminder PlatformAnnouncement (picked up by the existing
 * DashboardBanners component with zero frontend changes needed).
 *
 * Stage 2: PAST_DUE subscriptions whose grace period has elapsed move to EXPIRED, and the tenant
 * itself is SUSPENDED — the exact mechanism resolveTenant already enforces (TenantSuspendedError).
 */
export async function handleExpireTrials(): Promise<void> {
  const now = new Date();

  const dueSubscriptions = await prisma.tenantSubscription.findMany({
    where: { status: { in: ["TRIALING", "ACTIVE"] }, currentPeriodEnd: { lt: now } },
    include: { plan: true },
  });
  for (const subscription of dueSubscriptions) {
    const gracePeriodEndsAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    await prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE", gracePeriodEndsAt },
    });
    await prisma.platformAnnouncement.create({
      data: {
        tenantId: subscription.tenantId,
        title: subscription.status === "TRIALING" ? "Your trial has ended" : "Your subscription payment is due",
        body: `Please renew your "${subscription.plan.name}" plan within ${GRACE_PERIOD_DAYS} days to avoid suspension.`,
        severity: "WARNING",
      },
    });
  }

  const overdueSubscriptions = await prisma.tenantSubscription.findMany({
    where: { status: "PAST_DUE", gracePeriodEndsAt: { lt: now } },
  });
  for (const subscription of overdueSubscriptions) {
    await prisma.$transaction([
      prisma.tenantSubscription.update({ where: { id: subscription.id }, data: { status: "EXPIRED" } }),
      prisma.tenant.update({ where: { id: subscription.tenantId }, data: { status: "SUSPENDED" } }),
    ]);
    await prisma.platformAnnouncement.create({
      data: {
        tenantId: subscription.tenantId,
        title: "Account suspended",
        body: "Your account has been suspended due to non-payment. Contact support to reactivate.",
        severity: "CRITICAL",
      },
    });
  }

  console.log(
    `[billing] expire-trials: past_due=${dueSubscriptions.length} suspended=${overdueSubscriptions.length}`
  );
}
