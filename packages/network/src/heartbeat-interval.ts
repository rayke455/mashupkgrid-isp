/**
 * How often a router checks in, and so how long its silence means "offline".
 *
 * Each check-in downloads the report script and posts the results over HTTPS. On a small router —
 * a hAP lite has one 650 MHz MIPS core and 32 MB — two TLS handshakes a minute plus the hotspot
 * self-check kept the CPU at 100%: check-ins piled up, the console froze, and phones timed out
 * loading the sign-in page. Small routers therefore check in every 5 minutes; everything else
 * every minute. The report script sets the router's own scheduler to match (buildHeartbeatScript),
 * and every "is it online?" decision allows 2.5 intervals.
 */

type RouterSize = { memoryTotalBytes?: bigint | number | null; boardName?: string | null; name?: string | null };

const SMALL_MEMORY_BYTES = 64 * 1024 * 1024;
/** Boards with 64 MB or less, for a router that hasn't reported its memory yet. */
const SMALL_BOARDS = /\b(hAP lite|hAP mini|mAP lite|cAP lite|hEX lite|RB941|RB931|RB750r2)\b/i;

export function isSmallRouter(router: RouterSize): boolean {
  if (router.memoryTotalBytes !== null && router.memoryTotalBytes !== undefined) {
    return Number(router.memoryTotalBytes) <= SMALL_MEMORY_BYTES;
  }
  const boardOrName = [router.boardName, router.name].filter(Boolean).join(" ");
  // A newly linked/reset router has not reported its board or memory yet. Treat it as small until
  // it proves otherwise: the first heartbeat must not freeze a 32 MB hAP lite while we are still
  // learning its hardware. The interval can move to 1m after a later report with >64 MB.
  return !boardOrName || SMALL_BOARDS.test(boardOrName);
}

/** Seconds between check-ins. */
export function heartbeatIntervalSeconds(router: RouterSize): number {
  return isSmallRouter(router) ? 300 : 60;
}

/** The interval as RouterOS writes it, for the scheduler; null while the router's size is unknown. */
export function heartbeatIntervalRouterOs(router: RouterSize): "1m" | "5m" | null {
  const known = (router.memoryTotalBytes !== null && router.memoryTotalBytes !== undefined) || Boolean(router.boardName);
  // Unknown hardware gets the conservative interval for the same reason as isSmallRouter().
  if (!known) return "5m";
  return isSmallRouter(router) ? "5m" : "1m";
}

/** How long after its last check-in a router still counts as online: 2.5 intervals (two missed). */
export function heartbeatOnlineWindowMs(router: RouterSize): number {
  return heartbeatIntervalSeconds(router) * 2.5 * 1000;
}

/** Past the online window but within this, it is "late" (warning) rather than down: 4 intervals. */
export function heartbeatLateWindowMs(router: RouterSize): number {
  return heartbeatIntervalSeconds(router) * 4 * 1000;
}
