import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const chain = {
    set: vi.fn(),
    lpush: vi.fn(),
    ltrim: vi.fn(),
    exec: vi.fn().mockResolvedValue([]),
  };
  chain.set.mockReturnValue(chain);
  chain.lpush.mockReturnValue(chain);
  chain.ltrim.mockReturnValue(chain);
  return { chain, redis: { multi: vi.fn(() => chain), set: vi.fn().mockResolvedValue("OK") } };
});

vi.mock("../redis.js", () => ({ redis: h.redis }));

import { recordJobRun, triggerOf } from "../job-runs.js";

describe("recordJobRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.chain.set.mockReturnValue(h.chain);
    h.chain.lpush.mockReturnValue(h.chain);
    h.chain.ltrim.mockReturnValue(h.chain);
  });

  it("stores the handler's counters as the last run and prepends it to the history", async () => {
    const summary = await recordJobRun("generate-invoices", "schedule", async () => ({ created: 3 }));
    expect(summary).toEqual({ created: 3 });

    const stored = JSON.parse(h.chain.set.mock.calls[0]![1] as string);
    expect(h.chain.set.mock.calls[0]![0]).toBe("automation:job:generate-invoices:last");
    expect(stored).toMatchObject({ job: "generate-invoices", trigger: "schedule", ok: true, summary: { created: 3 }, error: null });
    expect(h.chain.lpush).toHaveBeenCalledWith("automation:job:generate-invoices:runs", expect.any(String));
    expect(h.chain.ltrim).toHaveBeenCalledWith("automation:job:generate-invoices:runs", 0, 19);
  });

  it("records a failure and still rethrows so BullMQ counts the job as failed", async () => {
    await expect(recordJobRun("poll-router-health", "manual", async () => { throw new Error("router timed out"); })).rejects.toThrow(
      "router timed out"
    );
    const stored = JSON.parse(h.chain.set.mock.calls[0]![1] as string);
    expect(stored).toMatchObject({ ok: false, error: "router timed out", trigger: "manual" });
  });

  it("treats a handler that returns nothing as an empty summary", async () => {
    expect(await recordJobRun("cleanup-expired-tokens", "schedule", async () => undefined)).toEqual({});
  });

  it("never lets a Redis outage fail a run that already completed", async () => {
    h.chain.exec.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordJobRun("mark-overdue-invoices", "schedule", async () => ({ marked: 1 }))).resolves.toEqual({ marked: 1 });
    spy.mockRestore();
  });
});

describe("triggerOf", () => {
  it("reads the dashboard's manual trigger and defaults everything else to the schedule", () => {
    expect(triggerOf({ trigger: "manual", requestedBy: "u1" })).toBe("manual");
    expect(triggerOf({})).toBe("schedule");
    expect(triggerOf(undefined)).toBe("schedule");
  });
});
