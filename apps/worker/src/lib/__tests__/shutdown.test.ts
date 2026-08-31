import { describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "../shutdown.js";

describe("createGracefulShutdown", () => {
  it("closes all resources once and exits cleanly even if called twice", async () => {
    const closeOne = vi.fn(async () => undefined);
    const closeTwo = vi.fn(async () => undefined);
    const exit = vi.fn();
    const log = vi.fn();

    const shutdown = createGracefulShutdown([closeOne, closeTwo], exit, { log });

    await shutdown("SIGINT");
    await shutdown("SIGTERM");

    expect(closeOne).toHaveBeenCalledTimes(1);
    expect(closeTwo).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).toHaveBeenCalled();
  });
});
