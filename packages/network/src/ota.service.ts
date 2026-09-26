import { prisma, type Router } from "@mashupkgrid/database";
import { createAdapterForRouter } from "./factory.js";
import {
  applyRouterSpeedtestBoost,
  enableRouterPcqFairQueue,
  enableRouterSafeFamilyDns,
  reconcileRouterProvisioning,
  startRouterAntiTunnelShield,
} from "./router.service.js";

/**
 * Over-the-air changes an ISP can push to its MikroTik routers from the dashboard, one router or
 * the whole fleet: RouterOS and bootloader upgrades, the latest hotspot setup, the network
 * features the dashboard already offers per router, a reboot, or the ISP's own RouterOS script.
 * Each action reports one plain result per router, which the Router updates page shows.
 */

export type OtaActionKey =
  | "check-versions"
  | "routeros-upgrade"
  | "firmware-upgrade"
  | "reapply-setup"
  | "pcq-fair-queue"
  | "safe-dns-on"
  | "safe-dns-off"
  | "anti-tunnel-on"
  | "anti-tunnel-off"
  | "speedtest-boost"
  | "reboot"
  | "custom-script";

export interface OtaAction {
  key: OtaActionKey;
  label: string;
  description: string;
  group: "updates" | "features" | "maintenance";
  /** Drops customers off for a minute or two (reboot, upgrade). Suggest running it at night. */
  disruptive: boolean;
  /** Needs the ISP's own script text. */
  needsScript?: boolean;
}

export const OTA_ACTIONS: readonly OtaAction[] = [
  { key: "check-versions", group: "updates", disruptive: false, label: "Check versions", description: "Reads each router's RouterOS version, model and firmware, and whether a RouterOS update is out. Changes nothing." },
  { key: "routeros-upgrade", group: "updates", disruptive: true, label: "Upgrade RouterOS", description: "Downloads the latest RouterOS for the router's update channel and installs it. The router reboots." },
  { key: "firmware-upgrade", group: "updates", disruptive: true, label: "Upgrade RouterBOARD firmware", description: "Brings the bootloader up to the installed RouterOS and reboots. Run it after a RouterOS upgrade." },
  { key: "reapply-setup", group: "updates", disruptive: false, label: "Push latest hotspot setup", description: "Re-applies the current login page, RADIUS server, walled garden and app filter, so routers pick up the platform's newest setup." },
  { key: "pcq-fair-queue", group: "features", disruptive: false, label: "Fair bandwidth sharing (PCQ)", description: "Shares bandwidth evenly between users so one heavy downloader cannot slow everyone else." },
  { key: "safe-dns-on", group: "features", disruptive: false, label: "Family-safe DNS on", description: "Uses Cloudflare Family DNS, which blocks malware and adult sites." },
  { key: "safe-dns-off", group: "features", disruptive: false, label: "Family-safe DNS off", description: "Goes back to standard fast DNS (1.1.1.1, 8.8.8.8)." },
  { key: "anti-tunnel-on", group: "features", disruptive: false, label: "Anti-tunnel shield on", description: "Blocks VPN and tunnel tricks used to get free internet on the hotspot." },
  { key: "anti-tunnel-off", group: "features", disruptive: false, label: "Anti-tunnel shield off", description: "Removes the anti-tunnel firewall rules." },
  { key: "speedtest-boost", group: "features", disruptive: false, label: "Speed test boost", description: "Lets speed test sites run at the line's full speed so customers see what they pay for." },
  { key: "reboot", group: "maintenance", disruptive: true, label: "Reboot", description: "Restarts the router. Customers are offline for about a minute." },
  { key: "custom-script", group: "maintenance", disruptive: false, label: "Run my RouterOS script", description: "Runs your own RouterOS script on each router, exactly as written, and records what it printed.", needsScript: true },
];

export function findOtaAction(key: string): OtaAction | undefined {
  return OTA_ACTIONS.find((a) => a.key === key);
}

export interface OtaResult {
  status: "SUCCEEDED" | "SKIPPED" | "FAILED";
  message: string;
}

const MAX_MESSAGE = 1000;
const clip = (s: string) => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s);

/** Runs one action on one router and says what happened. Never throws: a failure is a result. */
export async function runOtaActionOnRouter(
  router: Pick<Router, "id" | "tenantId" | "name" | "vendor" | "host" | "vpnIp" | "apiPort" | "useTls" | "usernameEncrypted" | "passwordEncrypted" | "status">,
  action: OtaActionKey,
  params: { script?: string } = {}
): Promise<OtaResult> {
  const host = router.host || router.vpnIp;
  if (router.vendor !== "MIKROTIK") return { status: "SKIPPED", message: "Only MikroTik routers can be updated over the air" };
  if (!host) return { status: "SKIPPED", message: "The router has not checked in yet" };
  if (router.status === "DOWN") return { status: "SKIPPED", message: "The router is offline" };

  try {
    switch (action) {
      case "reapply-setup": {
        const changes = await reconcileRouterProvisioning(router.id, { force: true });
        if (changes === null) return { status: "SKIPPED", message: "The router has no hotspot setup to re-apply" };
        return { status: "SUCCEEDED", message: changes.length ? `Updated: ${changes.join("; ")}` : "Already up to date" };
      }
      case "pcq-fair-queue":
        return { status: "SUCCEEDED", message: (await enableRouterPcqFairQueue(router.tenantId, router.id)).message };
      case "safe-dns-on":
      case "safe-dns-off":
        return { status: "SUCCEEDED", message: (await enableRouterSafeFamilyDns(router.tenantId, router.id, action === "safe-dns-on")).message };
      case "anti-tunnel-on":
      case "anti-tunnel-off":
        await startRouterAntiTunnelShield(router.tenantId, router.id, action === "anti-tunnel-on");
        return { status: "SUCCEEDED", message: action === "anti-tunnel-on" ? "Anti-tunnel rules are being applied" : "Anti-tunnel rules are being removed" };
      case "speedtest-boost":
        return { status: "SUCCEEDED", message: (await applyRouterSpeedtestBoost(router.tenantId, router.id)).message };
      default:
        break;
    }

    const adapter = createAdapterForRouter({ ...router, host });
    await adapter.connect();
    try {
      switch (action) {
        case "check-versions": {
          const info = await adapter.getDeviceInfo!();
          const update = adapter.checkFirmwareUpdate ? await adapter.checkFirmwareUpdate().catch(() => null) : null;
          await prisma.router.update({
            where: { id: router.id },
            data: { routerOsVersion: info.routerOsVersion, boardName: info.boardName, firmwareVersion: info.firmwareCurrent, versionCheckedAt: new Date() },
          });
          const parts = [`RouterOS ${info.routerOsVersion ?? "unknown"}`, info.boardName, info.firmwareCurrent ? `firmware ${info.firmwareCurrent}` : null].filter(Boolean);
          if (update?.upgradeAvailable) parts.push(`RouterOS ${update.latestVersion} available`);
          if (info.firmwareCurrent && info.firmwareAvailable && info.firmwareCurrent !== info.firmwareAvailable) parts.push(`firmware ${info.firmwareAvailable} available`);
          return { status: "SUCCEEDED", message: parts.join(" · ") };
        }
        case "routeros-upgrade": {
          const check = await adapter.checkFirmwareUpdate!();
          if (!check.upgradeAvailable) return { status: "SKIPPED", message: `Already on the latest RouterOS (${check.currentVersion})` };
          await adapter.installFirmwareUpdate!();
          await prisma.router.update({ where: { id: router.id }, data: { versionCheckedAt: null } });
          return { status: "SUCCEEDED", message: `Upgrading RouterOS ${check.currentVersion} to ${check.latestVersion}. The router reboots on its own.` };
        }
        case "firmware-upgrade": {
          const result = await adapter.upgradeRouterboardFirmware!();
          if (!result.changed) return { status: "SKIPPED", message: `Firmware already current (${result.from})` };
          return { status: "SUCCEEDED", message: `Firmware ${result.from} to ${result.to}. Rebooting.` };
        }
        case "reboot":
          await adapter.reboot!();
          return { status: "SUCCEEDED", message: "Rebooting" };
        case "custom-script": {
          const script = params.script?.trim();
          if (!script) return { status: "FAILED", message: "No script to run" };
          const output = await adapter.runScript!(script);
          return { status: "SUCCEEDED", message: output.trim() ? `Output: ${clip(output.trim())}` : "Ran with no output" };
        }
        default:
          return { status: "FAILED", message: `Unknown action ${action}` };
      }
    } finally {
      await adapter.disconnect().catch(() => undefined);
    }
  } catch (err) {
    return { status: "FAILED", message: clip(err instanceof Error ? err.message : String(err)) };
  }
}
