import { Prisma, prisma, type RadiusNas, type Router } from "@mashupkgrid/database";
import { ConflictError, generateAlnumSecret } from "@mashupkgrid/shared";

/** Every router needs exactly one `nas` row — the shared secret FreeRADIUS uses to trust
 *  Access-Request/Accounting-Request packets claiming to come from it (see the `RadiusNas`
 *  model comment, and infrastructure/freeradius/raddb/clients.conf, which must carry the same
 *  secret on the FreeRADIUS side since dynamic SQL-backed client loading is off there).
 *  Idempotent: returns the existing row if this router already has one rather than rotating its
 *  secret out from under a NAS that's already configured with it. */
export async function getOrCreateNasForRouter(tenantId: string, router: Router & { host: string }): Promise<RadiusNas> {
  const existing = await prisma.radiusNas.findFirst({ where: { tenantId, routerId: router.id } });
  if (existing) return existing;

  try {
    return await prisma.radiusNas.create({
      data: {
        tenantId,
        routerId: router.id,
        nasname: router.host,
        shortname: router.name,
        type: "mikrotik",
        secret: generateAlnumSecret(32),
      },
    });
  } catch (err) {
    // `nasname` must be globally unique — FreeRADIUS matches an incoming Access-Request's shared
    // secret purely by the packet's source IP, so two routers can never share one, even across
    // tenants. A private-range collision (e.g. two tenants both leaving a router at MikroTik's
    // factory-default 192.168.88.1) is the realistic way this fires, not a bug — the operator
    // needs a routable/distinguishable address for this router before it can act as a NAS.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError(
        `Another router is already registered as a RADIUS client at "${router.host}" — this router needs a distinct, reachable address before it can authenticate PPPoE/hotspot users`
      );
    }
    throw err;
  }
}
