import { prisma } from "@mashupkgrid/database";
import { dayKeyInTimeZone } from "@mashupkgrid/shared";

/** See getRevenueByDay in @mashupkgrid/billing — same reasoning, same default. */
async function tenantTimeZone(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  return tenant?.timezone || "Africa/Nairobi";
}

export interface BandwidthByDay {
  date: string;
  uploadBytes: number;
  downloadBytes: number;
  sessionCount: number;
}

export interface TopConsumer {
  username: string;
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
  sessionCount: number;
}

/** Acct-Input-Octets/Acct-Output-Octets are BigInt in the schema (a long-running session can
 *  exceed 2^53 bytes over its lifetime) but every real value here comfortably fits in a JS
 *  number for reporting purposes — years of continuous traffic before that's a concern. */
function toNumber(value: bigint | null): number {
  return value === null ? 0 : Number(value);
}

/** Mirrors the grouping style of packages/billing/src/reports.service.ts's getRevenueByDay:
 *  fetch the window's rows once, bucket in memory — radacct rows are read-heavy reporting data,
 *  not a write path, so this trades a bit of memory for staying consistent with how every other
 *  report in this codebase is written rather than introducing a second, raw-SQL style here. */
export async function getBandwidthByDay(tenantId: string, days = 30): Promise<BandwidthByDay[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [timeZone, sessions] = await Promise.all([
    tenantTimeZone(tenantId),
    prisma.radAcct.findMany({
      where: { tenantId, acctStartTime: { gte: since } },
      select: { acctStartTime: true, acctInputOctets: true, acctOutputOctets: true },
    }),
  ]);

  const byDay = new Map<string, BandwidthByDay>();
  for (const session of sessions) {
    if (!session.acctStartTime) continue;
    const key = dayKeyInTimeZone(session.acctStartTime, timeZone);
    const bucket = byDay.get(key) ?? { date: key, uploadBytes: 0, downloadBytes: 0, sessionCount: 0 };
    bucket.uploadBytes += toNumber(session.acctInputOctets);
    bucket.downloadBytes += toNumber(session.acctOutputOctets);
    bucket.sessionCount += 1;
    byDay.set(key, bucket);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getTopBandwidthConsumers(
  tenantId: string,
  days = 30,
  limit = 10
): Promise<TopConsumer[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sessions = await prisma.radAcct.findMany({
    where: { tenantId, acctStartTime: { gte: since } },
    select: { username: true, acctInputOctets: true, acctOutputOctets: true },
  });

  const byUser = new Map<string, TopConsumer>();
  for (const session of sessions) {
    const bucket = byUser.get(session.username) ?? {
      username: session.username,
      uploadBytes: 0,
      downloadBytes: 0,
      totalBytes: 0,
      sessionCount: 0,
    };
    const up = toNumber(session.acctInputOctets);
    const down = toNumber(session.acctOutputOctets);
    bucket.uploadBytes += up;
    bucket.downloadBytes += down;
    bucket.totalBytes += up + down;
    bucket.sessionCount += 1;
    byUser.set(session.username, bucket);
  }

  return [...byUser.values()].sort((a, b) => b.totalBytes - a.totalBytes).slice(0, limit);
}
