import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const nas = await prisma.radiusNas.findFirst({ where: { nasname: "192.168.1.198" } });
console.log("NAS secret:", nas?.secret ?? "NOT FOUND");

// Create a throwaway test voucher directly (bypassing the API) so we have a known
// username/password pair to test the embedded RADIUS server against.
const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-isp" } });
const code = "RADIUSTEST1";
await prisma.hotspotVoucher.upsert({
  where: { tenantId_code: { tenantId: tenant.id, code } },
  update: { status: "ACTIVE" },
  create: { tenantId: tenant.id, code, durationMinutes: 60, status: "ACTIVE" },
});
await prisma.radCheck.deleteMany({ where: { username: code } });
await prisma.radCheck.create({ data: { username: code, attribute: "Cleartext-Password", op: ":=", value: code } });
console.log("Test voucher ready:", code);
process.exit(0);
