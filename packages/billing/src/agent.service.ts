import { prisma, Prisma, type Agent, type AgentSale } from "@mashupkgrid/database";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { generateVouchers } from "@mashupkgrid/radius";
import { recordPaymentForInvoiceWithDb, topUpWalletWithDb } from "./payment.service.js";

/**
 * Agents: shops that sell the ISP's hotspot vouchers and take customers' bill payments in cash.
 * The agent keeps a commission on each and owes the ISP the rest; staff record the money they
 * hand over. A monthly statement shows sales, commission, what was handed over and the balance.
 */

export function commissionMinor(amountMinor: number, percent: number): number {
  return Math.floor((amountMinor * percent) / 100);
}

/** An agent that can act: exists in the ISP and isn't suspended. */
export async function getActiveAgentOrThrow(tenantId: string, agentId: string): Promise<Agent> {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!agent) throw new NotFoundError("Agent");
  if (agent.status !== "ACTIVE") throw new ForbiddenError("This agent account is suspended");
  return agent;
}

/** Makes `count` new vouchers of a hotspot package and puts them in the agent's stock. */
export async function issueAgentVouchers(tenantId: string, agentId: string, hotspotPackageId: string, count: number, userId: string | null): Promise<number> {
  await getActiveAgentOrThrow(tenantId, agentId);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new ValidationError("Give between 1 and 500 vouchers at a time");
  const vouchers = await generateVouchers({ tenantId, hotspotPackageId, count });
  await prisma.hotspotVoucher.updateMany({ where: { id: { in: vouchers.map((v) => v.id) } }, data: { agentId, createdByUserId: userId } });
  return vouchers.length;
}

/** Unsold vouchers the agent holds, per package. */
export async function agentStock(agentId: string) {
  const rows = await prisma.hotspotVoucher.groupBy({
    by: ["hotspotPackageId"],
    where: { agentId, status: "UNUSED", agentSale: null },
    _count: { _all: true },
  });
  const packages = await prisma.hotspotPackage.findMany({
    where: { id: { in: rows.map((r) => r.hotspotPackageId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, name: true, priceMinor: true, currency: true, durationMinutes: true },
  });
  const byId = new Map(packages.map((p) => [p.id, p]));
  return rows
    .filter((r) => r.hotspotPackageId && byId.has(r.hotspotPackageId))
    .map((r) => ({ package: byId.get(r.hotspotPackageId!)!, count: r._count._all }))
    .sort((a, b) => a.package.priceMinor - b.package.priceMinor);
}

/** Hands the next voucher of a package from the agent's stock to a buyer, and records the sale. */
export async function sellAgentVoucher(tenantId: string, agentId: string, hotspotPackageId: string, buyerPhone: string | null) {
  const agent = await getActiveAgentOrThrow(tenantId, agentId);
  const pkg = await prisma.hotspotPackage.findFirst({ where: { id: hotspotPackageId, tenantId } });
  if (!pkg) throw new NotFoundError("Hotspot package");
  // Two taps at once can pick the same voucher; the unique voucherId on the sale lets only one
  // win, and the other simply takes the next voucher.
  for (let attempt = 0; attempt < 5; attempt++) {
    const voucher = await prisma.hotspotVoucher.findFirst({
      where: { agentId, hotspotPackageId, status: "UNUSED", agentSale: null },
      orderBy: { createdAt: "asc" },
    });
    if (!voucher) throw new ConflictError(`No ${pkg.name} vouchers left in stock`);
    try {
      const sale = await prisma.agentSale.create({
        data: {
          tenantId,
          agentId,
          kind: "VOUCHER",
          voucherId: voucher.id,
          description: `Voucher ${pkg.name}`,
          amountMinor: pkg.priceMinor,
          commissionMinor: commissionMinor(pkg.priceMinor, agent.voucherCommissionPercent),
          buyerPhone,
        },
      });
      return { sale, code: voucher.code, package: { name: pkg.name, priceMinor: pkg.priceMinor, currency: pkg.currency, durationMinutes: pkg.durationMinutes } };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new ConflictError("Too many sales at once. Please try again.");
}

/** Finds a customer by the account number on their bill, for the agent's payment screen. */
export async function findCustomerForAgent(tenantId: string, accountNumber: string) {
  const customer = await prisma.customer.findFirst({
    where: { tenantId, deletedAt: null, customerNumber: { equals: accountNumber.trim(), mode: "insensitive" } },
    select: { id: true, fullName: true, customerNumber: true },
  });
  if (!customer) throw new NotFoundError("Customer with that account number");
  const open = await prisma.invoice.aggregate({
    where: { customerId: customer.id, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
    _sum: { totalMinor: true, amountPaidMinor: true },
  });
  // Only the first name: the agent needs to confirm who they're paying for, not see the account.
  return {
    id: customer.id,
    name: customer.fullName.split(/\s+/)[0] ?? customer.fullName,
    customerNumber: customer.customerNumber,
    owedMinor: (open._sum.totalMinor ?? 0) - (open._sum.amountPaidMinor ?? 0),
  };
}

/**
 * Cash an agent took toward a customer's bill. Paid onto the oldest open bills first; anything
 * over what is owed goes to the customer's wallet. Paying a bill in full reconnects the
 * customer, as any other payment does.
 */
export async function collectAgentPayment(tenantId: string, agentId: string, agentUserId: string, customerId: string, amountMinor: number, requestId: string) {
  const agent = await getActiveAgentOrThrow(tenantId, agentId);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new ValidationError("Enter the amount received");
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null }, select: { id: true, fullName: true, customerNumber: true } });
  if (!customer) throw new NotFoundError("Customer");
  const reference = `Agent ${agent.name}`;

  return prisma.$transaction(async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { customerId, tenantId, status: { in: ["OVERDUE", "PARTIALLY_PAID", "PENDING"] } },
      orderBy: { dueDate: "asc" },
    });
    let left = amountMinor;
    const paymentIds: string[] = [];
    for (const inv of invoices) {
      if (left <= 0) break;
      const due = inv.totalMinor - inv.amountPaidMinor;
      if (due <= 0) continue;
      const part = Math.min(due, left);
      const res = await recordPaymentForInvoiceWithDb(tx, tenantId, {
        invoiceId: inv.id,
        method: "CASH",
        amountMinor: part,
        reference,
        recordedByUserId: agentUserId,
        idempotencyKey: `agent:${requestId}:${inv.id}`,
      });
      paymentIds.push(res.payment.id);
      left -= part;
    }
    if (left > 0) {
      const res = await topUpWalletWithDb(tx, tenantId, { customerId, amountMinor: left, method: "CASH", reference, recordedByUserId: agentUserId, idempotencyKey: `agent:${requestId}:wallet` });
      paymentIds.push(res.payment.id);
    }
    const sale = await tx.agentSale.create({
      data: {
        tenantId,
        agentId,
        kind: "COLLECTION",
        paymentId: paymentIds[0] ?? null,
        customerId,
        description: `Payment for ${customer.customerNumber}`,
        amountMinor,
        commissionMinor: commissionMinor(amountMinor, agent.collectionCommissionPercent),
      },
    });
    return { sale, customer: { name: customer.fullName.split(/\s+/)[0] ?? customer.fullName, customerNumber: customer.customerNumber } };
  });
}

export async function recordAgentRemittance(tenantId: string, agentId: string, input: { amountMinor: number; method: string; reference?: string | null; note?: string | null }, userId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
  if (!agent) throw new NotFoundError("Agent");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new ValidationError("Enter the amount handed over");
  return prisma.agentRemittance.create({ data: { tenantId, agentId, amountMinor: input.amountMinor, method: input.method, reference: input.reference ?? null, note: input.note ?? null, recordedByUserId: userId } });
}

/** What the agent owes the ISP: everything taken, less commission, less what was handed over. */
async function balanceBefore(agentId: string, before: Date | null): Promise<number> {
  const at = before ? { lt: before } : undefined;
  const [sales, paidIn] = await Promise.all([
    prisma.agentSale.aggregate({ where: { agentId, ...(at ? { createdAt: at } : {}) }, _sum: { amountMinor: true, commissionMinor: true } }),
    prisma.agentRemittance.aggregate({ where: { agentId, ...(at ? { createdAt: at } : {}) }, _sum: { amountMinor: true } }),
  ]);
  return (sales._sum.amountMinor ?? 0) - (sales._sum.commissionMinor ?? 0) - (paidIn._sum.amountMinor ?? 0);
}

export async function agentBalance(agentId: string): Promise<number> {
  return balanceBefore(agentId, null);
}

/** One month for one agent: every sale and hand-over, the totals, and the balance at each end.
 *  `month` is 1-12, in UTC. */
export async function agentStatement(agentId: string, year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  const [opening, sales, remittances] = await Promise.all([
    balanceBefore(agentId, from),
    prisma.agentSale.findMany({ where: { agentId, createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "asc" } }),
    prisma.agentRemittance.findMany({ where: { agentId, createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "asc" } }),
  ]);
  const sum = (xs: AgentSale[], k: "amountMinor" | "commissionMinor") => xs.reduce((s, x) => s + x[k], 0);
  const vouchers = sales.filter((s) => s.kind === "VOUCHER");
  const collections = sales.filter((s) => s.kind === "COLLECTION");
  const takenMinor = sum(sales, "amountMinor");
  const commission = sum(sales, "commissionMinor");
  const handedOverMinor = remittances.reduce((s, r) => s + r.amountMinor, 0);
  return {
    year,
    month,
    openingBalanceMinor: opening,
    vouchers: { count: vouchers.length, amountMinor: sum(vouchers, "amountMinor"), commissionMinor: sum(vouchers, "commissionMinor") },
    collections: { count: collections.length, amountMinor: sum(collections, "amountMinor"), commissionMinor: sum(collections, "commissionMinor") },
    takenMinor,
    commissionMinor: commission,
    dueMinor: takenMinor - commission,
    handedOverMinor,
    closingBalanceMinor: opening + takenMinor - commission - handedOverMinor,
    sales,
    remittances,
  };
}

/** Every agent in the ISP with their stock, this month's takings and what they owe. */
export async function listAgentsWithTotals(tenantId: string) {
  const agents = await prisma.agent.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } } } });
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return Promise.all(
    agents.map(async (a) => {
      const [stock, month, balance] = await Promise.all([
        prisma.hotspotVoucher.count({ where: { agentId: a.id, status: "UNUSED", agentSale: null } }),
        prisma.agentSale.aggregate({ where: { agentId: a.id, createdAt: { gte: monthStart } }, _sum: { amountMinor: true, commissionMinor: true }, _count: { _all: true } }),
        agentBalance(a.id),
      ]);
      return {
        id: a.id,
        name: a.name,
        phone: a.phone,
        location: a.location,
        status: a.status,
        email: a.user?.email ?? null,
        signedUp: Boolean(a.userId),
        voucherCommissionPercent: a.voucherCommissionPercent,
        collectionCommissionPercent: a.collectionCommissionPercent,
        stock,
        monthSales: month._count._all,
        monthTakenMinor: month._sum.amountMinor ?? 0,
        monthCommissionMinor: month._sum.commissionMinor ?? 0,
        balanceMinor: balance,
      };
    })
  );
}

