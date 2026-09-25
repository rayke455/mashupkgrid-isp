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

  // 1. Immediately expire trials that have ended
  const expiredTrials = await prisma.tenantSubscription.findMany({
    where: { status: "TRIALING", currentPeriodEnd: { lt: now } },
    include: { plan: true },
  });
  for (const subscription of expiredTrials) {
    await prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
    });
    await prisma.platformAnnouncement.create({
      data: {
        tenantId: subscription.tenantId,
        title: "Your free trial has ended",
        body: `Your free trial for plan "${subscription.plan.name}" has expired. All tenant features are paused. Please subscribe under Settings > Billing to reactivate.`,
        severity: "CRITICAL",
      },
    });
  }

  // 2. Paid active subscriptions whose period ended move to PAST_DUE with grace period
  const dueSubscriptions = await prisma.tenantSubscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lt: now } },
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
        title: "Your subscription payment is due",
        body: `Please renew your "${subscription.plan.name}" plan within ${GRACE_PERIOD_DAYS} days to avoid suspension.`,
        severity: "WARNING",
      },
    });
  }

  // 3. Overdue subscriptions past grace period move to EXPIRED
  const overdueSubscriptions = await prisma.tenantSubscription.findMany({
    where: { status: "PAST_DUE", gracePeriodEndsAt: { lt: now } },
  });
  for (const subscription of overdueSubscriptions) {
    await prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
    });
    await prisma.platformAnnouncement.create({
      data: {
        tenantId: subscription.tenantId,
        title: "Subscription expired",
        body: "Your subscription has expired due to non-payment. Please renew under Settings > Billing to reactivate.",
        severity: "CRITICAL",
      },
    });
  }

  console.log(
    `[billing] expire-trials: expiredTrials=${expiredTrials.length} past_due=${dueSubscriptions.length} overdueExpired=${overdueSubscriptions.length}`
  );
}
