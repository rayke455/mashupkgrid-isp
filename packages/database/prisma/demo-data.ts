/**
 * Development only: fills the seeded "demo-isp" tenant with realistic data — customers on
 * packages, paid/overdue invoices, vouchers, a router, live PPPoE and hotspot sessions, a
 * customer login (jane@example.com / Customer123!) and a pending ISP application — so every
 * dashboard has something to show. Runs after `pnpm db:seed` against a running API
 * (http://localhost:4000): `pnpm --filter @mashupkgrid/database demo-data`. Idempotent enough
 * to re-run. Never run it against production.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@mashupkgrid/shared";

const prisma = new PrismaClient();
const API = "http://localhost:4000";

async function api<T>(path: string, token: string | null, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data: T; error?: { message: string } };
  if (!json.success) throw new Error(`${method} ${path}: ${json.error?.message}`);
  return json.data;
}

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-isp" } });
  const login = await api<{ accessToken: string }>("/api/v1/auth/login", null, "POST", { tenantSlug: "demo-isp", email: "owner@demo-isp.local", password: "ChangeMe123!" });
  const token = login.accessToken;

  const packages = await api<{ items: { id: string; name: string; priceMinor: number }[] }>("/api/v1/packages?limit=50", token);
  const pkgByName = (n: string) => packages.items.find((p) => p.name.includes(n)) ?? packages.items[0]!;

  const people = [
    ["Jane Wanjiku", "+254700000001", "jane@example.com", "Home 10"],
    ["Brian Otieno", "+254700000002", "brian@example.com", "Home 10"],
    ["Faith Chebet", "+254700000003", null, "Home 20"],
    ["Samuel Mwangi", "+254700000004", "samuel@example.com", "Business"],
    ["Amina Hassan", "+254700000005", null, "Home 20"],
    ["Peter Kariuki", "+254700000006", "peter@example.com", "Home 10"],
    ["Grace Achieng", "+254700000007", null, "Business"],
    ["David Kimani", "+254700000008", "david@example.com", "Home 20"],
  ] as const;

  const customers: { id: string; name: string }[] = [];
  for (const [fullName, phone, email, pkg] of people) {
    const existing = await prisma.customer.findFirst({ where: { tenantId: tenant.id, phone } });
    const c = existing ?? (await api<{ id: string }>("/api/v1/customers", token, "POST", { fullName, phone, email: email ?? undefined, address: "Kasarani, Nairobi" }));
    customers.push({ id: c.id, name: fullName });
    const sub = await prisma.customerService.findFirst({ where: { customerId: c.id } });
    if (!sub) await api("/api/v1/subscriptions", token, "POST", { customerId: c.id, packageId: pkgByName(pkg).id });
  }

  // Pay most first invoices; leave two overdue, one partially paid.
  const invoices = await prisma.invoice.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  for (const [i, inv] of invoices.entries()) {
    if (inv.status !== "PENDING") continue;
    if (i % 4 === 3) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE", dueDate: new Date(Date.now() - 5 * 86_400_000) } });
      continue;
    }
    const amount = i % 4 === 2 ? Math.round(inv.totalMinor / 2) : inv.totalMinor;
    await api("/api/v1/payments/record", token, "POST", { invoiceId: inv.id, method: i % 2 ? "CASH" : "MANUAL", amountMinor: amount, reference: i % 2 ? undefined : `QAB${1000 + i}XYZ` });
  }
  // Spread payment dates over the month so the revenue chart has a shape.
  const payments = await prisma.payment.findMany({ where: { tenantId: tenant.id } });
  for (const [i, p] of payments.entries()) {
    await prisma.payment.update({ where: { id: p.id }, data: { createdAt: new Date(Date.now() - (i * 3 + 1) * 86_400_000) } });
  }

  // Suspend one overdue customer so the portal / online page show that state.
  const overdue = await prisma.invoice.findFirst({ where: { tenantId: tenant.id, status: "OVERDUE" }, select: { customerServiceId: true } });
  if (overdue?.customerServiceId) await prisma.customerService.update({ where: { id: overdue.customerServiceId }, data: { status: "SUSPENDED" } });

  // Hotspot vouchers
  const hp = await prisma.hotspotPackage.findFirst({ where: { tenantId: tenant.id } });
  if (hp && (await prisma.hotspotVoucher.count({ where: { tenantId: tenant.id } })) === 0) {
    await api("/api/v1/vouchers", token, "POST", { count: 12, hotspotPackageId: hp.id });
  }

  // A router that looks linked and online
  const router =
    (await prisma.router.findFirst({ where: { tenantId: tenant.id } })) ??
    (await prisma.router.create({
      data: { tenantId: tenant.id, name: "Kasarani hAP ac2", host: "10.8.0.2", usernameEncrypted: "x", passwordEncrypted: "x", status: "ONLINE" } as never,
    }));

  // Live sessions for Online users: PPPoE for linked customers, hotspot for two vouchers
  const radiusUsers = await prisma.radiusUser.findMany({ where: { tenantId: tenant.id }, take: 5 });
  const vouchers = await prisma.hotspotVoucher.findMany({ where: { tenantId: tenant.id }, take: 2 });
  await prisma.radAcct.deleteMany({ where: { tenantId: tenant.id } });
  let n = 0;
  for (const u of radiusUsers) {
    n += 1;
    await prisma.radAcct.create({
      data: {
        tenantId: tenant.id, acctSessionId: `s${n}`, acctUniqueId: `u-${n}-${Date.now()}`, username: u.username, nasIpAddress: router.host ?? "10.8.0.2",
        nasPortType: "Ethernet", framedProtocol: "PPP", framedIpAddress: `100.64.0.${10 + n}`, callingStationId: `AA:BB:CC:DD:EE:0${n}`,
        acctStartTime: new Date(Date.now() - n * 47 * 60_000), acctUpdateTime: new Date(Date.now() - 60_000), acctSessionTime: n * 47 * 60,
        acctInputOctets: BigInt(n * 120_000_000), acctOutputOctets: BigInt(n * 1_450_000_000),
      },
    });
  }
  for (const v of vouchers) {
    n += 1;
    await prisma.hotspotVoucher.update({ where: { id: v.id }, data: { status: "ACTIVE", activatedAt: new Date(), expiresAt: new Date(Date.now() + 3 * 3_600_000) } });
    await prisma.radAcct.create({
      data: {
        tenantId: tenant.id, acctSessionId: `s${n}`, acctUniqueId: `u-${n}-${Date.now()}`, username: v.code, nasIpAddress: router.host ?? "10.8.0.2",
        nasPortType: "Wireless-802.11", framedIpAddress: `10.5.50.${20 + n}`, callingStationId: `F0:9F:C2:11:22:${n}0`,
        acctStartTime: new Date(Date.now() - n * 9 * 60_000), acctUpdateTime: new Date(Date.now() - 30_000), acctSessionTime: n * 9 * 60,
        acctInputOctets: BigInt(n * 8_000_000), acctOutputOctets: BigInt(n * 95_000_000),
      },
    });
  }

  // A customer login for Jane, linked to her record
  const customerRole = await prisma.role.findFirstOrThrow({ where: { name: "CUSTOMER", tenantId: null } });
  const jane = customers.find((c) => c.name === "Jane Wanjiku")!;
  const user =
    (await prisma.user.findFirst({ where: { tenantId: tenant.id, email: "jane@example.com" } })) ??
    (await prisma.user.create({ data: { tenantId: tenant.id, email: "jane@example.com", passwordHash: await hashPassword("Customer123!"), status: "ACTIVE", emailVerifiedAt: new Date() } }));
  await prisma.userRole.upsert({ where: { userId_roleId_tenantId: { userId: user.id, roleId: customerRole.id, tenantId: tenant.id } }, update: {}, create: { userId: user.id, roleId: customerRole.id, tenantId: tenant.id } });
  await prisma.customer.update({ where: { id: jane.id }, data: { userId: user.id } });
  // Give Jane an open invoice so the portal shows "Pay now".
  const janeInv = await prisma.invoice.findFirst({ where: { customerId: jane.id } });
  if (janeInv) await prisma.invoice.update({ where: { id: janeInv.id }, data: { status: "PENDING", amountPaidMinor: 0, dueDate: new Date(Date.now() + 4 * 86_400_000) } });

  // A pending ISP application for the super admin to see
  if (!(await prisma.tenant.findUnique({ where: { slug: "nyeri-wifi" } }))) {
    await prisma.tenant.create({ data: { name: "Nyeri Wi-Fi Ltd", slug: "nyeri-wifi", status: "PENDING_APPROVAL", timezone: "Africa/Nairobi", currency: "KES" } });
  }
  console.log("demo data ready");
}

main().finally(() => prisma.$disconnect());
