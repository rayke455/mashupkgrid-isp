import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@mashupkgrid/database";
import { withRetryOnNumberCollision } from "../sequence.js";

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

describe("withRetryOnNumberCollision", () => {
  it("returns the result on the first successful attempt", async () => {
    const computeCandidate = vi.fn(async (attempt: number) => `CAND-${attempt}`);
    const create = vi.fn(async (candidate: string) => ({ id: "1", candidate }));

    const result = await withRetryOnNumberCollision(computeCandidate, create);

    expect(result).toEqual({ id: "1", candidate: "CAND-0" });
    expect(computeCandidate).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries with the next candidate on a unique-constraint collision", async () => {
    const computeCandidate = vi.fn(async (attempt: number) => `CAND-${attempt}`);
    const create = vi
      .fn()
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockResolvedValueOnce({ id: "3" });

    const result = await withRetryOnNumberCollision(computeCandidate, create);

    expect(result).toEqual({ id: "3" });
    expect(computeCandidate).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(1, "CAND-0");
    expect(create).toHaveBeenNthCalledWith(2, "CAND-1");
    expect(create).toHaveBeenNthCalledWith(3, "CAND-2");
  });

  it("does not retry a non-collision error — it propagates immediately", async () => {
    const computeCandidate = vi.fn(async () => "CAND");
    const otherError = new Error("database is down");
    const create = vi.fn().mockRejectedValue(otherError);

    await expect(withRetryOnNumberCollision(computeCandidate, create)).rejects.toThrow("database is down");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("gives up and throws after maxAttempts collisions", async () => {
    const computeCandidate = vi.fn(async (attempt: number) => `CAND-${attempt}`);
    const create = vi.fn().mockRejectedValue(uniqueConstraintError());

    await expect(withRetryOnNumberCollision(computeCandidate, create, 3)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError
    );
    expect(create).toHaveBeenCalledTimes(3);
  });
});
