import { prisma, type UpgradeSuggestion } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, resolveTenantPreferences } from "@mashupkgrid/shared";
import { changeSubscriptionPackage } from "./subscription.service.js";

/**
 * Finds subscribers who keep running into their package's data cap and the next plan up that
 * would fit them. Usage is the RADIUS accounting the routers already report, summed over the last
 * 30 days. A subscription gets at most one suggestion in 30 days, whatever staff did with the
 * last one, so nobody is nagged.
 */

const DAY = 86_400_000;
const WINDOW_DAYS = 30;

export interface PackageOption {
  id: string;
  name: string;
  priceMinor: number;
  dataCapMb: number | null;
  downloadKbps: number;
  billingCycle: string;
  isActive: boolean;
}

/**
 * The cheapest active package that costs more, is at least as fast, and allows more data (or has
 * no cap), on the same billing cycle. Null when there is nothing bigger to offer.
 */
export function pickUpgradeTarget(current: PackageOption, options: PackageOption[]): PackageOption | null {
  const capMb = current.dataCapMb ?? Infinity;
  const candidates = options.filter(
    (p) =>
      p.id !== current.id &&
      p.isActive &&
      p.billingCycle === current.billingCycle &&
      p.priceMinor > current.priceMinor &&
      p.downloadKbps >= current.downloadKbps &&
      (p.dataCapMb === null || p.dataCapMb > capMb)
  );
  candidates.sort((a, b) => a.priceMinor - b.priceMinor || (b.dataCapMb ?? Infinity) - (a.dataCapMb ?? Infinity));
  return candidates[0] ?? null;
}

/** Creates suggestions for one tenant. Returns the new ones, with the customer's phone and name,
 *  so the caller can text them. */
export async function findUpgradeSuggestions(
  tenantId: string
): Promise<(UpgradeSuggestion & { customer: { fullName: string; phone: string } })[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { preferences: true } });
  const prefs = resolveTenantPreferences(tenant?.preferences).upgrades;
  if (!prefs.enabled) return [];

  const services = await prisma.customerService.findMany({
    where: { tenantId, status: "ACTIVE", package: { dataCapMb: { not: null } }, radiusUser: { isNot: null } },
    select: { id: true, customerId: true, package: true, radiusUser: { select: { username: true } } },
  });
  if (!services.length) return [];

  const since = new Date(Date.now() - WINDOW_DAYS * DAY);
  const usage = await prisma.$queryRaw<{ username: string; bytes: bigint | null }[]>`
    SELECT username, SUM(COALESCE(acctinputoctets, 0) + COALESCE(acctoutputoctets, 0))::bigint AS bytes
    FROM radacct
    WHERE "tenantId" = ${tenantId} AND (acctstarttime >= ${since} OR acctstoptime IS NULL OR acctupdatetime >= ${since})
    GROUP BY username`;
  const usedMbByUser = new Map(usage.map((u) => [u.username, Number(u.bytes ?? 0n) / (1024 * 1024)]));

  const recent = await prisma.upgradeSuggestion.findMany({
    where: { tenantId, createdAt: { gte: since } },
    select: { customerServiceId: true },
  });
  const suggestedRecently = new Set(recent.map((r) => r.customerServiceId));

  const packages = await prisma.package.findMany({
    where: { tenantId, deletedAt: null, isActive: true },
    select: { id: true, name: true, priceMinor: true, dataCapMb: true, downloadKbps: true, billingCycle: true, isActive: true, currency: true },
  });

  const created: (UpgradeSuggestion & { customer: { fullName: string; phone: string } })[] = [];
  for (const service of services) {
    const cap = service.package.dataCapMb!;
    const usedMb = usedMbByUser.get(service.radiusUser!.username) ?? 0;
    if (usedMb < (cap * prefs.thresholdPercent) / 100) continue;
    if (suggestedRecently.has(service.id)) continue;
    const target = pickUpgradeTarget(service.package, packages);
    if (!target) continue;
    const suggestion = await prisma.upgradeSuggestion.create({
      data: {
        tenantId,
        customerId: service.customerId,
        customerServiceId: service.id,
        fromPackageId: service.package.id,
        fromPackageName: service.package.name,
        toPackageId: target.id,
        toPackageName: target.name,
        toPriceMinor: target.priceMinor,
        currency: packages.find((p) => p.id === target.id)?.currency ?? "KES",
        usedMb: Math.round(usedMb),
        capMb: cap,
      },
      include: { customer: { select: { fullName: true, phone: true } } },
    });
    created.push(suggestion);
  }
  return created;
}

export async function listUpgradeSuggestions(tenantId: string, status: "PENDING" | "APPLIED" | "DISMISSED" = "PENDING") {
  return prisma.upgradeSuggestion.findMany({
    where: { tenantId, status },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { customer: { select: { id: true, fullName: true, phone: true, customerNumber: true } } },
  });
}

async function pendingOrThrow(tenantId: string, suggestionId: string): Promise<UpgradeSuggestion> {
  const suggestion = await prisma.upgradeSuggestion.findFirst({ where: { id: suggestionId, tenantId } });
  if (!suggestion) throw new NotFoundError("Upgrade suggestion");
  if (suggestion.status !== "PENDING") throw new ConflictError("This suggestion has already been handled");
  return suggestion;
}

/** Moves the subscription onto the suggested package (which re-provisions the router) and marks
 *  the suggestion applied. The package change takes effect now; billing picks up the new price
 *  from the next invoice. */
export async function applyUpgradeSuggestion(tenantId: string, suggestionId: string, userId: string): Promise<UpgradeSuggestion> {
  const suggestion = await pendingOrThrow(tenantId, suggestionId);
  const service = await prisma.customerService.findFirst({ where: { id: suggestion.customerServiceId, tenantId } });
  if (!service) throw new NotFoundError("Subscription");
  if (service.packageId !== suggestion.fromPackageId) {
    throw new ConflictError("The customer's plan changed since this was suggested. Dismiss it instead.");
  }
  await changeSubscriptionPackage(tenantId, suggestion.customerServiceId, suggestion.toPackageId);
  return prisma.upgradeSuggestion.update({
    where: { id: suggestionId },
    data: { status: "APPLIED", decidedByUserId: userId, decidedAt: new Date() },
  });
}

export async function dismissUpgradeSuggestion(tenantId: string, suggestionId: string, userId: string): Promise<UpgradeSuggestion> {
  await pendingOrThrow(tenantId, suggestionId);
  return prisma.upgradeSuggestion.update({
    where: { id: suggestionId },
    data: { status: "DISMISSED", decidedByUserId: userId, decidedAt: new Date() },
  });
}

/** The text sent to the customer when a suggestion is found. */
export function upgradeSuggestionSms(input: {
  firstName: string;
  isp: string;
  usedMb: number;
  capMb: number;
  fromPackage: string;
  toPackage: string;
  price: string;
}): string {
  const gb = (mb: number) => `${(mb / 1024).toFixed(mb >= 10 * 1024 ? 0 : 1)} GB`;
  return (
    `Hi ${input.firstName}, you've used ${gb(input.usedMb)} of your ${gb(input.capMb)} on ${input.fromPackage} this month. ` +
    `${input.toPackage} gives you more for ${input.price}. Call ${input.isp} to switch.`
  );
}
