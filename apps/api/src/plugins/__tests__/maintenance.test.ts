import { describe, it, expect } from "vitest";
import { isAudienceBlockedAtLevel, isCategoryExplicitlyAllowed } from "../maintenance.js";
import type { RouteAudience } from "../../types.js";

const AUDIENCES: RouteAudience[] = ["public", "customer", "staff", "platform", "system-critical"];

describe("isAudienceBlockedAtLevel", () => {
  it("LEVEL 1 (normal) blocks nothing", () => {
    for (const audience of AUDIENCES) {
      expect(isAudienceBlockedAtLevel(audience, 1)).toBe(false);
    }
  });

  it("LEVEL 2 (customer maintenance) blocks public/customer, staff and platform keep working", () => {
    expect(isAudienceBlockedAtLevel("public", 2)).toBe(true);
    expect(isAudienceBlockedAtLevel("customer", 2)).toBe(true);
    expect(isAudienceBlockedAtLevel("staff", 2)).toBe(false);
    expect(isAudienceBlockedAtLevel("platform", 2)).toBe(false);
  });

  it("LEVEL 4 (full maintenance) blocks staff too, only platform admin remains reachable", () => {
    expect(isAudienceBlockedAtLevel("public", 4)).toBe(true);
    expect(isAudienceBlockedAtLevel("customer", 4)).toBe(true);
    expect(isAudienceBlockedAtLevel("staff", 4)).toBe(true);
    expect(isAudienceBlockedAtLevel("platform", 4)).toBe(false);
  });

  it("LEVEL 5 (emergency lockdown) blocks every audience except system-critical", () => {
    expect(isAudienceBlockedAtLevel("public", 5)).toBe(true);
    expect(isAudienceBlockedAtLevel("customer", 5)).toBe(true);
    expect(isAudienceBlockedAtLevel("staff", 5)).toBe(true);
    expect(isAudienceBlockedAtLevel("platform", 5)).toBe(true);
  });

  it("an unknown/out-of-range level fails closed (blocks everything) rather than open", () => {
    expect(isAudienceBlockedAtLevel("public", 99)).toBe(true);
    expect(isAudienceBlockedAtLevel("platform", 0)).toBe(true);
  });

  it("system-critical is never in any level's block set, even LEVEL 5", () => {
    // Belt-and-braces: checkMaintenance already short-circuits for audience === "system-critical"
    // before this table is ever consulted (payment callbacks/webhooks/health checks), but the
    // table itself is also exemption-safe if that early return were ever removed.
    for (let level = 1; level <= 5; level++) {
      expect(isAudienceBlockedAtLevel("system-critical", level)).toBe(false);
    }
  });
});

describe("isCategoryExplicitlyAllowed", () => {
  // Regression test: a live end-to-end run against a real DB caught that these flags were
  // accepted by the maintenance-update API and stored, but never actually consulted by the
  // enforcement middleware — e.g. a super admin with allowLogin=true still couldn't log in
  // during LEVEL 4 maintenance because the login route wasn't checked against the flag at all.
  it("'login' category defers to allowLogin", () => {
    expect(isCategoryExplicitlyAllowed("login", { allowLogin: true, allowPayments: false })).toBe(true);
    expect(isCategoryExplicitlyAllowed("login", { allowLogin: false, allowPayments: true })).toBe(false);
  });

  it("'payment' category defers to allowPayments", () => {
    expect(isCategoryExplicitlyAllowed("payment", { allowLogin: false, allowPayments: true })).toBe(true);
    expect(isCategoryExplicitlyAllowed("payment", { allowLogin: true, allowPayments: false })).toBe(false);
  });
});
