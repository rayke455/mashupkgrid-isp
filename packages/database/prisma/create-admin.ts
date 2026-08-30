import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@mashupkgrid/shared";

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || "admin@mashuphost.tech").trim().toLowerCase();
  const password = process.argv[3] || "Admin12345!";

  console.log(`Setting up Super Admin for: ${email}`);

  const passwordHash = await hashPassword(password);

  const superAdminRole = await prisma.role.findFirst({
    where: { name: "SUPER_ADMIN", tenantId: null },
  });

  if (!superAdminRole) {
    console.error("Error: SUPER_ADMIN role not found in database. Run seed first.");
    process.exit(1);
  }

  // Find existing platform user or create new
  let user = await prisma.user.findFirst({
    where: { tenantId: null, email },
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        lockedUntil: null,
        failedLoginCount: 0,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`Updated existing user: ${email}`);
  } else {
    user = await prisma.user.create({
      data: {
        tenantId: null,
        email,
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`Created new Super Admin user: ${email}`);
  }

  // Ensure SUPER_ADMIN role is assigned
  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: superAdminRole.id, tenantId: null },
  });

  if (!existingRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: superAdminRole.id,
        tenantId: null,
      },
    });
  }

  console.log("\n==============================================");
  console.log("Super Admin Account Ready:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Tenant:   (leave blank on login page)`);
  console.log("==============================================\n");
}

main()
  .catch((err) => {
    console.error("Failed to create admin:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
