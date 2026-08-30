import { describe, it, expect } from "vitest";
import { assertNoPrivilegeEscalation } from "../rbac.js";
import { ForbiddenError } from "@mashupkgrid/shared";

describe("assertNoPrivilegeEscalation", () => {
  it("allows granting a subset of the grantor's own permissions", () => {
    const grantor = new Set(["customers.read", "customers.update", "billing.read"]);
    expect(() =>
      assertNoPrivilegeEscalation(grantor, ["customers.read", "billing.read"])
    ).not.toThrow();
  });

  it("throws when requesting a permission the grantor does not hold", () => {
    const grantor = new Set(["customers.read"]);
    expect(() => assertNoPrivilegeEscalation(grantor, ["customers.read", "billing.create"])).toThrow(
      ForbiddenError
    );
  });

  it("lists every missing permission in the error, not just the first", () => {
    const grantor = new Set<string>([]);
    try {
      assertNoPrivilegeEscalation(grantor, ["a.read", "b.write"]);
      throw new Error("expected assertNoPrivilegeEscalation to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as Error).message).toContain("a.read");
      expect((err as Error).message).toContain("b.write");
    }
  });
});
