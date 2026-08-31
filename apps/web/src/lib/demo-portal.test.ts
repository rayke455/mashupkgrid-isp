import { describe, expect, it } from "vitest";
import { getDemoTenantSlug, isDemoPortalEnabled } from "./demo-portal";

describe("demo portal gating", () => {
  const setEnv = (key: string, value: string | undefined) => {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
      return;
    }

    Object.defineProperty(process.env, key, {
      value,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  };

  it("disables demo routing in production even when a demo slug exists", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDemoTenant = process.env.NEXT_PUBLIC_DEMO_TENANT_SLUG;

    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PUBLIC_DEMO_TENANT_SLUG", "demo-isp");

    try {
      expect(isDemoPortalEnabled()).toBe(false);
      expect(getDemoTenantSlug()).toBeNull();
    } finally {
      if (originalNodeEnv === undefined) setEnv("NODE_ENV", undefined);
      else setEnv("NODE_ENV", originalNodeEnv);

      if (originalDemoTenant === undefined) setEnv("NEXT_PUBLIC_DEMO_TENANT_SLUG", undefined);
      else setEnv("NEXT_PUBLIC_DEMO_TENANT_SLUG", originalDemoTenant);
    }
  });

  it("allows demo routing in development by default", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDemoTenant = process.env.NEXT_PUBLIC_DEMO_TENANT_SLUG;

    setEnv("NODE_ENV", "development");
    setEnv("NEXT_PUBLIC_DEMO_TENANT_SLUG", undefined);

    try {
      expect(isDemoPortalEnabled()).toBe(true);
      expect(getDemoTenantSlug()).toBe("demo-isp");
    } finally {
      if (originalNodeEnv === undefined) setEnv("NODE_ENV", undefined);
      else setEnv("NODE_ENV", originalNodeEnv);

      if (originalDemoTenant === undefined) setEnv("NEXT_PUBLIC_DEMO_TENANT_SLUG", undefined);
      else setEnv("NEXT_PUBLIC_DEMO_TENANT_SLUG", originalDemoTenant);
    }
  });
});
