/**
 * One-off, idempotent backfill for the Phase 3 subscription system — run once after
 * 20260828183840_tenant_plans_subscriptions is applied. Not part of the SQL migration itself
 * (schema migrations here are structure-only): creates a generous default "Legacy" TenantPlan if
 * none is marked isDefault yet, then gives every pre-existing Tenant with no subscription row a
 * real TenantSubscription on it, so usage-limit and feature-gating checks never break a tenant
 * that existed before this feature shipped. Safe to re-run — every step checks for existing state
 * first.
 *
 * Run from packages/database: `npx tsx scripts/backfill-tenant-subscriptions.ts`
 */
import { PrismaClient } from "@prisma/client";
import { TENANT_FEATURES } from "@mashupkgrid/shared";

const prisma = new PrismaClient();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function main() {
  let defaultPlan = await prisma.tenantPlan.findFirst({ where: { isDefault: true } });
  if (!defaultPlan) {
    console.log('Creating default "Legacy" plan...');
    defaultPlan = await prisma.tenantPlan.create({
      data: {
        name: "Legacy",
        slug: "legacy",
        description: "Auto-created for tenants that existed before the plans system shipped.",
        monthlyPriceMinor: 0,
        trialDays: 7,
        maxCustomers: null,
        maxRouters: null,
        features: [...TENANT_FEATURES],
        isDefault: true,
        isActive: true,
        sortOrder: 0,
      },
    });
  } else {
    console.log(`Default plan already exists: "${defaultPlan.name}" (${defaultPlan.id})`);
  }

  const tenants = await prisma.tenant.findMany({
    where: { subscription: null },
    select: { id: true, status: true, trialEndsAt: true },
  });
  console.log(`Found ${tenants.length} tenant(s) with no subscription row.`);

  const now = new Date();
  let created = 0;
  for (const tenant of tenants) {
    const stillTrialing = tenant.trialEndsAt !== null && tenant.trialEndsAt > now;
    const status =
      tenant.status === "CANCELLED"
        ? "CANCELLED"
        : tenant.status === "SUSPENDED"
          ? "EXPIRED"
          : stillTrialing
            ? "TRIALING"
            : "ACTIVE";
    // 30-day runway for already-active tenants so the backfill itself never immediately puts
    // anyone into PAST_DUE.
    const currentPeriodEnd = stillTrialing ? tenant.trialEndsAt! : new Date(now.getTime() + THIRTY_DAYS_MS);

    await prisma.tenantSubscription.create({
      data: { tenantId: tenant.id, planId: defaultPlan.id, status, currentPeriodEnd },
    });
    created += 1;
  }

  console.log(`Backfilled ${created} subscription(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
