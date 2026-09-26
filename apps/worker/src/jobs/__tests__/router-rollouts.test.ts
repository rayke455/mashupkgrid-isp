import { describe, it, expect, beforeEach, vi } from "vitest";

/** The first router goes alone; if it fails the rest are left untouched, and if it works the
 *  rest follow. Every router is updated at most once. */

type Target = { id: string; rolloutId: string; routerId: string; position: number; status: string; message?: string; startedAt?: Date };
const h = vi.hoisted(() => ({
  rollouts: [] as Array<{ id: string; tenantId: string; action: string; params: null; status: string; canaryFirst: boolean; createdAt: Date; startedAt: Date | null; createdByUserId: string | null }>,
  targets: [] as Target[],
  run: vi.fn(),
}));

function matches(t: Target, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    const val = (t as Record<string, unknown>)[k];
    if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(val);
    if (v && typeof v === "object" && "lt" in (v as object)) return false;
    return val === v;
  });
}

vi.mock("@mashupkgrid/database", () => ({
  prisma: {
    routerRollout: {
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = h.rollouts.filter((r) => (!where.id || r.id === where.id) && r.status === where.status);
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
      findMany: vi.fn(async () => h.rollouts.filter((r) => r.status === "RUNNING")),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(h.rollouts.find((r) => r.id === where.id)!, data)),
    },
    routerRolloutTarget: {
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
        const hit = h.targets.filter((t) => matches(t, where));
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      }),
      findMany: vi.fn(async ({ where }: { where: { rolloutId: string } }) => h.targets.filter((t) => t.rolloutId === where.rolloutId).sort((a, b) => a.position - b.position)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(h.targets.find((t) => t.id === where.id)!, data)),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => h.targets.filter((t) => matches(t, where)).length),
      groupBy: vi.fn(async () => []),
    },
    router: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, name: where.id })) },
  },
}));
vi.mock("@mashupkgrid/network", () => ({
  findOtaAction: (key: string) => ({ key, label: key }),
  backupRouter: vi.fn().mockResolvedValue({}),
  runOtaActionOnRouter: h.run,
}));
vi.mock("@mashupkgrid/push", () => ({ pushToUser: vi.fn().mockResolvedValue(0), pushToTenantStaff: vi.fn().mockResolvedValue(0) }));

import { handleRouterRollouts } from "../router-rollouts.js";

function setup(canaryFirst: boolean) {
  h.rollouts = [{ id: "ro1", tenantId: "t1", action: "reboot", params: null, status: "RUNNING", canaryFirst, createdAt: new Date(), startedAt: null, createdByUserId: "u1" }];
  h.targets = ["a", "b", "c"].map((r, position) => ({ id: `t-${r}`, rolloutId: "ro1", routerId: r, position, status: "PENDING" }));
}

describe("router rollouts", () => {
  beforeEach(() => h.run.mockReset());

  it("stops after the first router fails", async () => {
    setup(true);
    h.run.mockResolvedValueOnce({ status: "FAILED", message: "timeout" });
    await handleRouterRollouts();
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.targets.map((t) => t.status)).toEqual(["FAILED", "SKIPPED", "SKIPPED"]);
    expect(h.rollouts[0]!.status).toBe("COMPLETED");
  });

  it("updates the rest once the first router succeeds, each exactly once", async () => {
    setup(true);
    h.run.mockResolvedValue({ status: "SUCCEEDED", message: "ok" });
    await handleRouterRollouts();
    await handleRouterRollouts();
    expect(h.run.mock.calls.map((c) => c[0].id)).toEqual(["a", "b", "c"]);
    expect(h.targets.every((t) => t.status === "SUCCEEDED")).toBe(true);
    expect(h.rollouts[0]!.status).toBe("COMPLETED");
  });
});
