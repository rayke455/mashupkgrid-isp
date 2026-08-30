import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, hashPassword } from "@mashupkgrid/shared";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding permission catalog...");
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: describePermission(key) },
    });
  }

  console.log("Seeding system roles...");
  for (const [roleName, permissionKeys] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
    // findFirst + create rather than upsert: Prisma's compound-unique `where` input requires
    // a non-null value for every field in the key, but system roles use tenantId = null.
    const role =
      (await prisma.role.findFirst({ where: { tenantId: null, name: roleName } })) ??
      (await prisma.role.create({ data: { name: roleName, isSystem: true, tenantId: null } }));

    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...permissionKeys] } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  console.log("Seeding demo tenant + super admin...");

  const superAdminEmail = "superadmin@mashupkgrid.local";
  const superAdminPassword = process.env["SEED_SUPER_ADMIN_PASSWORD"] ?? "ChangeMe123!";
  const superAdminRole = await prisma.role.findFirstOrThrow({
    where: { name: "SUPER_ADMIN", tenantId: null },
  });

  const superAdmin =
    (await prisma.user.findFirst({ where: { tenantId: null, email: superAdminEmail } })) ??
    (await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: await hashPassword(superAdminPassword),
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        tenantId: null,
      },
    }));

  const existingSuperAdminUserRole = await prisma.userRole.findFirst({
    where: { userId: superAdmin.id, roleId: superAdminRole.id, tenantId: null },
  });
  if (!existingSuperAdminUserRole) {
    await prisma.userRole.create({
      data: { userId: superAdmin.id, roleId: superAdminRole.id, tenantId: null },
    });
  }

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: "demo-isp" },
    update: {},
    create: {
      name: "Demo ISP",
      slug: "demo-isp",
      status: "ACTIVE",
      timezone: "Africa/Nairobi",
      currency: "KES",
    },
  });

  const ownerEmail = "owner@demo-isp.local";
  const ownerPassword = process.env["SEED_TENANT_OWNER_PASSWORD"] ?? "ChangeMe123!";
  const ownerRole = await prisma.role.findFirstOrThrow({
    where: { name: "ISP_OWNER", tenantId: null },
  });

  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: ownerEmail } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: ownerEmail,
      passwordHash: await hashPassword(ownerPassword),
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId_tenantId: { userId: owner.id, roleId: ownerRole.id, tenantId: demoTenant.id },
    },
    update: {},
    create: { userId: owner.id, roleId: ownerRole.id, tenantId: demoTenant.id },
  });

  console.log("Seeding demo packages (Phase 2)...");
  const demoPackages: Array<Parameters<typeof prisma.package.create>[0]["data"]> = [
    {
      tenantId: demoTenant.id,
      name: "Home 10 Mbps",
      description: "Entry-level home fiber plan",
      downloadKbps: 10_000,
      uploadKbps: 5_000,
      billingCycle: "MONTHLY",
      priceMinor: 100_000, // KES 1,000.00
      currency: "KES",
      installationFeeMinor: 500_000,
      taxPercent: 16,
    },
    {
      tenantId: demoTenant.id,
      name: "Business 50 Mbps",
      description: "Dedicated business-grade plan",
      downloadKbps: 50_000,
      uploadKbps: 25_000,
      billingCycle: "MONTHLY",
      priceMinor: 500_000, // KES 5,000.00
      currency: "KES",
      installationFeeMinor: 1_000_000,
      taxPercent: 16,
    },
  ];
  for (const data of demoPackages) {
    const existing = await prisma.package.findFirst({ where: { tenantId: demoTenant.id, name: data.name } });
    if (!existing) await prisma.package.create({ data });
  }

  console.log("Seeding demo hotspot packages...");
  const demoHotspotPackages = [
    {
      tenantId: demoTenant.id,
      name: "1 Hour",
      description: "1 Hour high-speed access",
      durationMinutes: 60,
      downloadKbps: 5_000,
      uploadKbps: 2_000,
      priceMinor: 1_000, // KES 10.00
      currency: "KES",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "4 Hours",
      description: "4 Hours unlimited access",
      durationMinutes: 240,
      downloadKbps: 5_000,
      uploadKbps: 2_000,
      priceMinor: 1_500, // KES 15.00
      currency: "KES",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "8 Hours",
      description: "8 Hours browsing pass",
      durationMinutes: 480,
      downloadKbps: 5_000,
      uploadKbps: 2_000,
      priceMinor: 2_000, // KES 20.00
      currency: "KES",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "12 Hours",
      description: "Half-day pass",
      durationMinutes: 720,
      downloadKbps: 5_000,
      uploadKbps: 2_000,
      priceMinor: 2_500, // KES 25.00
      currency: "KES",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "25 Hours",
      description: "25 Hours (1 Day+) unlimited",
      durationMinutes: 1_500,
      downloadKbps: 5_000,
      uploadKbps: 2_000,
      priceMinor: 3_500, // KES 35.00
      currency: "KES",
      isPopular: true,
      badge: "MOST POPULAR",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "3 Days",
      description: "3 Days unlimited pass",
      durationMinutes: 4_320,
      downloadKbps: 8_000,
      uploadKbps: 3_000,
      priceMinor: 7_000, // KES 70.00
      currency: "KES",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "5 Days",
      description: "5 Days unlimited pass",
      durationMinutes: 7_200,
      downloadKbps: 8_000,
      uploadKbps: 3_000,
      priceMinor: 12_000, // KES 120.00
      currency: "KES",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "Weekly",
      description: "7 Days unlimited access",
      durationMinutes: 10_080,
      downloadKbps: 8_000,
      uploadKbps: 3_000,
      priceMinor: 18_000, // KES 180.00
      currency: "KES",
      isPopular: true,
      badge: "BEST VALUE",
      isActive: true,
    },
    {
      tenantId: demoTenant.id,
      name: "Monthly",
      description: "30 Days unlimited access",
      durationMinutes: 43_200,
      downloadKbps: 10_000,
      uploadKbps: 4_000,
      priceMinor: 60_000, // KES 600.00
      currency: "KES",
      isActive: true,
    },
  ];

  for (const data of demoHotspotPackages) {
    const existing = await prisma.hotspotPackage.findFirst({
      where: { tenantId: demoTenant.id, name: data.name },
    });
    if (!existing) {
      await prisma.hotspotPackage.create({ data });
    } else {
      await prisma.hotspotPackage.update({ where: { id: existing.id }, data });
    }
  }

  console.log("Seeding initial maintenance state (disabled)...");
  const latestMaintenance = await prisma.maintenanceEvent.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!latestMaintenance) {
    await prisma.maintenanceEvent.create({
      data: {
        enabled: false,
        level: 1,
        allowedRoles: ["SUPER_ADMIN"],
        allowedIps: [],
        updatedBy: superAdmin.id,
      },
    });
  }

  console.log("Seed complete.");
  console.log(`  Super admin: ${superAdminEmail} / ${superAdminPassword}`);
  console.log(`  Demo tenant owner: ${ownerEmail} / ${ownerPassword} (tenant: demo-isp)`);
}

function describePermission(key: string): string {
  const [resource, action] = key.split(".");
  return `Allows '${action}' on '${resource}'`;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
