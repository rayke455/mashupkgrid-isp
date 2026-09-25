import { prisma } from "@mashupkgrid/database";

/**
 * Who is online, on what, and whether they have paid — hotspot and PPPoE in one list.
 *
 * Built from `radacct`, the accounting table every router already writes to, joined to what the
 * platform knows about each username: a PPPoE/hotspot-account login is a RadiusUser (so a
 * customer, a package and a payment history); a hotspot voucher login is a HotspotVoucher (so a
 * package and an expiry). Nothing here talks to a router, so the page is instant and works for
 * routers that are currently unreachable.
 */

export type TrackedSessionType = "PPPOE" | "HOTSPOT" | "STATIC_IP" | "IPTV";

export interface TrackedSession {
  id: string;
  username: string;
  type: TrackedSessionType;
  /** "ACTIVE" while the router has not sent Stop and is still sending interim updates. */
  state: "ACTIVE" | "STALE" | "ENDED";
  customer: { id: string; fullName: string; phone: string; customerNumber: string } | null;
  packageName: string | null;
  voucher: { code: string; expiresAt: string | null; status: string } | null;
  router: { id: string; name: string } | null;
  nasIpAddress: string;
  ipAddress: string | null;
  macAddress: string | null;
  startedAt: string | null;
  lastSeenAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  downloadBytes: number;
  uploadBytes: number;
  terminateCause: string | null;
  lastPayment: { amountMinor: number; currency: string; method: string; createdAt: string } | null;
}

export interface TrackedSessionsSummary {
  activeHotspot: number;
  activePppoe: number;
  activeOther: number;
  /** Active sessions whose customer/voucher has a completed payment on record. */
  activePaid: number;
}

/** A session with no accounting packet for this long is shown as stale: the router probably
 *  lost the Stop (reboot, link flap) rather than the customer still being online. */
export const SESSION_STALE_AFTER_MS = 15 * 60_000;

function toNumber(value: bigint | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export interface ListTrackedSessionsOptions {
  /** "active": no Stop yet. "recent": everything that started or stopped in the last `days`. */
  scope?: "active" | "recent";
  type?: TrackedSessionType;
  /** Matches username, customer name, phone, IP or MAC. */
  search?: string;
  days?: number;
  page?: number;
  limit?: number;
}

export async function listTrackedSessions(
  tenantId: string,
  options: ListTrackedSessionsOptions = {}
): Promise<{ items: TrackedSession[]; total: number; summary: TrackedSessionsSummary }> {
  const scope = options.scope ?? "active";
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const page = Math.max(options.page ?? 1, 1);
  const since = new Date(Date.now() - (options.days ?? 7) * 24 * 60 * 60_000);

  const where =
    scope === "active"
      ? { tenantId, acctStopTime: null }
      : { tenantId, OR: [{ acctStartTime: { gte: since } }, { acctStopTime: { gte: since } }] };

  // The join keys (customer name, phone) live in other tables, so text search is applied after
  // enrichment, on one bounded page of candidates rather than the whole table.
  const candidateTake = options.search ? Math.max(limit * 10, 500) : limit;
  const candidateSkip = options.search ? 0 : (page - 1) * limit;

  const [rows, total, activeRows] = await Promise.all([
    prisma.radAcct.findMany({
      where,
      orderBy: scope === "active" ? { acctStartTime: "desc" } : [{ acctStopTime: "desc" }, { acctStartTime: "desc" }],
      skip: candidateSkip,
      take: candidateTake,
    }),
    prisma.radAcct.count({ where }),
    // The summary is always about what is online now, whatever the list is showing.
    prisma.radAcct.findMany({ where: { tenantId, acctStopTime: null }, select: { username: true, framedProtocol: true } }),
  ]);

  const enriched = await enrich(tenantId, rows);
  const filtered = options.search ? enriched.filter(matches(options.search)) : enriched;
  const items = options.search ? filtered.slice((page - 1) * limit, page * limit) : filtered;

  const summary = await summarise(tenantId, activeRows, enriched);
  return { items, total: options.search ? filtered.length : total, summary };
}

function matches(search: string): (s: TrackedSession) => boolean {
  const q = search.trim().toLowerCase();
  if (!q) return () => true;
  return (s) =>
    s.username.toLowerCase().includes(q) ||
    (s.customer?.fullName.toLowerCase().includes(q) ?? false) ||
    (s.customer?.phone.includes(q) ?? false) ||
    (s.ipAddress?.includes(q) ?? false) ||
    (s.macAddress?.toLowerCase().includes(q) ?? false) ||
    (s.voucher?.code.toLowerCase().includes(q) ?? false);
}

type RadAcctRow = Awaited<ReturnType<typeof prisma.radAcct.findMany>>[number];

async function enrich(tenantId: string, rows: RadAcctRow[]): Promise<TrackedSession[]> {
  const usernames = [...new Set(rows.map((r) => r.username))];
  if (usernames.length === 0) return [];

  const [radiusUsers, vouchers, routers] = await Promise.all([
    prisma.radiusUser.findMany({
      where: { tenantId, username: { in: usernames } },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, customerNumber: true } },
        customerService: { include: { package: { select: { name: true, serviceType: true } } } },
      },
    }),
    prisma.hotspotVoucher.findMany({
      where: { tenantId, code: { in: usernames } },
      include: { hotspotPackage: { select: { name: true } }, package: { select: { name: true } } },
    }),
    prisma.router.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, host: true, vpnIp: true } }),
  ]);

  const byUser = new Map(radiusUsers.map((u) => [u.username, u]));
  const byCode = new Map(vouchers.map((v) => [v.code, v]));
  const routerByAddress = new Map<string, { id: string; name: string }>();
  for (const r of routers) {
    if (r.host) routerByAddress.set(r.host, { id: r.id, name: r.name });
    if (r.vpnIp) routerByAddress.set(r.vpnIp, { id: r.id, name: r.name });
  }

  // One completed payment per customer, the latest — a single query rather than one per row.
  const customerIds = [...new Set(radiusUsers.map((u) => u.customerId))];
  const payments =
    customerIds.length === 0
      ? []
      : await prisma.payment.findMany({
          where: { tenantId, customerId: { in: customerIds }, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          distinct: ["customerId"],
          select: { customerId: true, amountMinor: true, currency: true, method: true, createdAt: true },
        });
  const paymentByCustomer = new Map(payments.map((p) => [p.customerId!, p]));

  const now = Date.now();
  return rows.map((row) => {
    const user = byUser.get(row.username);
    const voucher = user ? undefined : byCode.get(row.username);
    const lastSeen = row.acctUpdateTime ?? row.acctStartTime;
    const state: TrackedSession["state"] = row.acctStopTime
      ? "ENDED"
      : lastSeen && now - lastSeen.getTime() > SESSION_STALE_AFTER_MS
        ? "STALE"
        : "ACTIVE";
    const type: TrackedSessionType = user
      ? user.customerService.package.serviceType
      : voucher
        ? "HOTSPOT"
        : row.framedProtocol?.toUpperCase().includes("PPP")
          ? "PPPOE"
          : "HOTSPOT";
    const payment = user ? paymentByCustomer.get(user.customerId) : undefined;
    const duration = row.acctSessionTime ?? (row.acctStartTime ? Math.max(0, Math.round(((row.acctStopTime ?? new Date()).getTime() - row.acctStartTime.getTime()) / 1000)) : 0);

    return {
      id: row.acctUniqueId,
      username: row.username,
      type,
      state,
      customer: user ? user.customer : null,
      packageName: user ? user.customerService.package.name : (voucher?.hotspotPackage?.name ?? voucher?.package?.name ?? null),
      voucher: voucher ? { code: voucher.code, expiresAt: iso(voucher.expiresAt), status: voucher.status } : null,
      router: routerByAddress.get(row.nasIpAddress) ?? null,
      nasIpAddress: row.nasIpAddress,
      ipAddress: row.framedIpAddress ?? null,
      macAddress: row.callingStationId ?? null,
      startedAt: iso(row.acctStartTime),
      lastSeenAt: iso(lastSeen),
      endedAt: iso(row.acctStopTime),
      durationSeconds: duration,
      // Accounting counts from the NAS's point of view: input = what the customer sent (upload).
      downloadBytes: toNumber(row.acctOutputOctets),
      uploadBytes: toNumber(row.acctInputOctets),
      terminateCause: row.acctTerminateCause ?? null,
      lastPayment: payment ? { amountMinor: payment.amountMinor, currency: payment.currency, method: payment.method, createdAt: payment.createdAt.toISOString() } : null,
    };
  });
}

async function summarise(
  tenantId: string,
  activeRows: { username: string; framedProtocol: string | null }[],
  alreadyEnriched: TrackedSession[]
): Promise<TrackedSessionsSummary> {
  const summary: TrackedSessionsSummary = { activeHotspot: 0, activePppoe: 0, activeOther: 0, activePaid: 0 };
  if (activeRows.length === 0) return summary;

  const known = new Map(alreadyEnriched.filter((s) => s.state !== "ENDED").map((s) => [s.username, s]));
  const unknown = activeRows.filter((r) => !known.has(r.username)).map((r) => r.username);
  const users =
    unknown.length === 0
      ? []
      : await prisma.radiusUser.findMany({
          where: { tenantId, username: { in: [...new Set(unknown)] } },
          select: { username: true, customerId: true, customerService: { select: { package: { select: { serviceType: true } } } } },
        });
  const userByName = new Map(users.map((u) => [u.username, u]));
  const paidCustomers = new Set(
    (
      await prisma.payment.findMany({
        where: { tenantId, status: "COMPLETED", customerId: { in: [...new Set(users.map((u) => u.customerId))] } },
        select: { customerId: true },
        distinct: ["customerId"],
      })
    ).map((p) => p.customerId)
  );

  for (const row of activeRows) {
    const enrichedRow = known.get(row.username);
    const user = userByName.get(row.username);
    const type: TrackedSessionType = enrichedRow?.type ?? user?.customerService.package.serviceType ?? (row.framedProtocol?.toUpperCase().includes("PPP") ? "PPPOE" : "HOTSPOT");
    if (type === "HOTSPOT") summary.activeHotspot += 1;
    else if (type === "PPPOE") summary.activePppoe += 1;
    else summary.activeOther += 1;
    const paid = enrichedRow ? enrichedRow.lastPayment !== null || enrichedRow.voucher !== null : user ? paidCustomers.has(user.customerId) : false;
    if (paid) summary.activePaid += 1;
  }
  return summary;
}
