import { prisma } from "@mashupkgrid/database";
import { invalidateMaintenanceCache } from "../lib/redis.js";

/**
 * Flips maintenance on/off at the boundaries of a scheduled window
 * (docs/architecture/05-maintenance-and-queues.md). Classified CRITICAL — it must keep running
 * even while the platform is itself under maintenance, since it's what turns maintenance back
 * off on schedule. Runs every minute (see index.ts repeatable job registration).
 */
export async function handleApplyScheduledMaintenance(): Promise<void> {
  const latest = await prisma.maintenanceEvent.findFirst({ orderBy: { createdAt: "desc" } });
  if (!latest || (!latest.startAt && !latest.endAt)) return;

  const now = new Date();

  if (!latest.enabled && latest.startAt && latest.startAt <= now && (!latest.endAt || latest.endAt > now)) {
    await prisma.maintenanceEvent.create({
      data: {
        enabled: true,
        level: latest.level,
        message: latest.message,
        startAt: latest.startAt,
        endAt: latest.endAt,
        allowLogin: latest.allowLogin,
        allowCustomerPortal: latest.allowCustomerPortal,
        allowPayments: latest.allowPayments,
        allowWebhooks: latest.allowWebhooks,
        allowApi: latest.allowApi,
        allowedRoles: latest.allowedRoles,
        allowedIps: latest.allowedIps,
        updatedBy: "system:scheduler",
      },
    });
    await invalidateMaintenanceCache();
    return;
  }

  if (latest.enabled && latest.endAt && latest.endAt <= now) {
    await prisma.maintenanceEvent.create({
      data: {
        enabled: false,
        level: 1,
        message: null,
        startAt: null,
        endAt: null,
        allowLogin: true,
        allowCustomerPortal: true,
        allowPayments: true,
        allowWebhooks: true,
        allowApi: true,
        allowedRoles: latest.allowedRoles,
        allowedIps: latest.allowedIps,
        updatedBy: "system:scheduler",
      },
    });
    await invalidateMaintenanceCache();
  }
}
