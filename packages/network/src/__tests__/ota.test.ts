import { describe, it, expect, beforeEach, vi } from "vitest";

/** Each over-the-air action gives one plain result per router and never throws. */

const h = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    checkFirmwareUpdate: vi.fn(),
    installFirmwareUpdate: vi.fn(),
    upgradeRouterboardFirmware: vi.fn(),
    runScript: vi.fn(),
    reboot: vi.fn(),
    getDeviceInfo: vi.fn(),
  },
  prisma: { router: { update: vi.fn() } },
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../factory.js", () => ({ createAdapterForRouter: () => h.adapter }));
vi.mock("../router.service.js", () => ({
  applyRouterSpeedtestBoost: vi.fn(),
  enableRouterPcqFairQueue: vi.fn(),
  enableRouterSafeFamilyDns: vi.fn(),
  reconcileRouterProvisioning: vi.fn(),
  startRouterAntiTunnelShield: vi.fn(),
}));

import { runOtaActionOnRouter } from "../ota.service.js";

const router = { id: "r1", tenantId: "t1", name: "Kasarani", vendor: "MIKROTIK" as const, host: "10.0.0.1", vpnIp: null, apiPort: 8728, useTls: false, usernameEncrypted: "", passwordEncrypted: "", status: "ONLINE" as const };

describe("router over-the-air actions", () => {
  beforeEach(() => {
    for (const f of Object.values(h.adapter)) f.mockReset();
    h.adapter.connect.mockResolvedValue(undefined);
    h.adapter.disconnect.mockResolvedValue(undefined);
    h.prisma.router.update.mockReset();
  });

  it("upgrades RouterOS only when an update is out", async () => {
    h.adapter.checkFirmwareUpdate.mockResolvedValueOnce({ currentVersion: "7.16.1", latestVersion: "7.16.1", status: "System is already up to date", upgradeAvailable: false });
    expect(await runOtaActionOnRouter(router, "routeros-upgrade")).toEqual({ status: "SKIPPED", message: "Already on the latest RouterOS (7.16.1)" });
    expect(h.adapter.installFirmwareUpdate).not.toHaveBeenCalled();

    h.adapter.checkFirmwareUpdate.mockResolvedValueOnce({ currentVersion: "7.14.3", latestVersion: "7.16.1", status: "New version is available", upgradeAvailable: true });
    const done = await runOtaActionOnRouter(router, "routeros-upgrade");
    expect(done.status).toBe("SUCCEEDED");
    expect(done.message).toContain("7.14.3 to 7.16.1");
    expect(h.adapter.installFirmwareUpdate).toHaveBeenCalledOnce();
  });

  it("skips offline and unlinked routers without connecting", async () => {
    expect((await runOtaActionOnRouter({ ...router, status: "DOWN" }, "reboot")).status).toBe("SKIPPED");
    expect((await runOtaActionOnRouter({ ...router, host: null }, "reboot")).status).toBe("SKIPPED");
    expect(h.adapter.connect).not.toHaveBeenCalled();
  });

  it("runs a script and records its output, and reports a rejected one as failed", async () => {
    h.adapter.runScript.mockResolvedValueOnce("ntp enabled\n");
    expect(await runOtaActionOnRouter(router, "custom-script", { script: "/system ntp client set enabled=yes" })).toEqual({ status: "SUCCEEDED", message: "Output: ntp enabled" });
    h.adapter.runScript.mockRejectedValueOnce(new Error("syntax error (line 1 column 5)"));
    expect(await runOtaActionOnRouter(router, "custom-script", { script: "/bad" })).toEqual({ status: "FAILED", message: "syntax error (line 1 column 5)" });
    expect(h.adapter.disconnect).toHaveBeenCalledTimes(2);
  });

  it("records versions from a check", async () => {
    h.adapter.getDeviceInfo.mockResolvedValueOnce({ routerOsVersion: "7.14.3 (stable)", boardName: "hAP ac2", firmwareCurrent: "7.14.3", firmwareAvailable: "7.14.3" });
    h.adapter.checkFirmwareUpdate.mockResolvedValueOnce({ currentVersion: "7.14.3", latestVersion: "7.16.1", status: "New version is available", upgradeAvailable: true });
    const r = await runOtaActionOnRouter(router, "check-versions");
    expect(r.message).toBe("RouterOS 7.14.3 (stable) · hAP ac2 · firmware 7.14.3 · RouterOS 7.16.1 available");
    expect(h.prisma.router.update.mock.calls[0]![0].data).toMatchObject({ routerOsVersion: "7.14.3 (stable)", boardName: "hAP ac2" });
  });
});
