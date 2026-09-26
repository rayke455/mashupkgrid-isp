import { describe, expect, it } from "vitest";
import { buildNavActions, buildNavSections, findCurrentNav, scoreNavMatch } from "./navigation";

const owner = {
  tenantId: "t1",
  permissions: ["customers.read", "customers.create", "packages.read", "billing.read", "payments.read", "routers.read", "routers.manage", "settings.manage", "reports.read"],
};
const admin = { tenantId: null, permissions: ["tenants.read", "maintenance.manage", "platform_payments.read"] };

const hrefs = (user: typeof owner | typeof admin) => buildNavSections(user).flatMap((s) => s.items.map((i) => i.href));

describe("navigation catalog", () => {
  it("shows a tenant owner only what their permissions allow, and no platform pages", () => {
    const links = hrefs(owner);
    expect(links).toContain("/customers");
    expect(links).toContain("/automation");
    expect(links).not.toContain("/tickets"); // no tickets.read
    expect(links).not.toContain("/tenants");
    expect(links).not.toContain("/maintenance");
  });

  it("shows a platform admin the platform map and never tenant-only pages", () => {
    const links = hrefs(admin);
    expect(links).toContain("/tenants");
    expect(links).toContain("/automation");
    expect(links).toContain("/admin/payments/fees");
    expect(links).not.toContain("/customers");
    expect(links).toContain("/admin/products"); // tenants.read covers the store too
  });

  it("drops a section with nothing visible in it", () => {
    const titles = buildNavSections({ tenantId: "t1", permissions: [] }).map((s) => s.title);
    expect(titles).not.toContain("Network");
    expect(titles).toContain("Account"); // sessions and the mobile app need no permission
  });

  it("resolves the breadcrumb to the most specific page", () => {
    const sections = buildNavSections(owner);
    expect(findCurrentNav(sections, "/payments/balance")?.item.label).toBe("Balance");
    expect(findCurrentNav(sections, "/payments")?.item.label).toBe("Payments");
    expect(findCurrentNav(sections, "/customers/abc")?.item.label).toBe("Customers");
    expect(findCurrentNav(sections, "/nowhere")).toBeNull();
  });

  it("offers actions only when the caller could actually do them", () => {
    expect(buildNavActions(owner).map((a) => a.id)).toEqual(["new-customer", "new-router", "overdue"]);
    expect(buildNavActions({ tenantId: "t1", permissions: [] })).toEqual([]);
  });
});

describe("scoreNavMatch", () => {
  const plans = { href: "/packages", label: "Internet plans", icon: "package" as const, keywords: "rate plans speed" };
  const paid = { href: "/payments-setup", label: "Getting paid", icon: "mpesa" as const, keywords: "m-pesa paystack till paybill" };

  it("ranks a label prefix above a keyword hit", () => {
    expect(scoreNavMatch("in", plans)).toBeGreaterThan(scoreNavMatch("pay", plans));
    expect(scoreNavMatch("mpesa", paid)).toBe(0); // hyphenated in the keywords; typed without
    expect(scoreNavMatch("m-pesa", paid)).toBe(1);
    expect(scoreNavMatch("paid", paid)).toBe(2);
  });

  it("requires every word to match and matches the section title too", () => {
    expect(scoreNavMatch("internet router", plans)).toBe(0);
    expect(scoreNavMatch("customers plans", plans, "Customers")).toBeGreaterThan(0);
    expect(scoreNavMatch("", plans)).toBe(1);
  });
});
