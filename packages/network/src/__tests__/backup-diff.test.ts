import { describe, it, expect, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));
vi.mock("../factory.js", () => ({ createAdapterForRouter: vi.fn() }));
vi.mock("../router.service.js", () => ({ routerFacingApiBase: () => "https://api.example.com" }));

import { diffExports } from "../backup.service.js";

describe("comparing two router exports", () => {
  it("ignores the date header and reports changed lines", () => {
    const before = "# 2026-09-25 02:00:01 by RouterOS 7.14.3\n/ip dns\nset servers=8.8.8.8\n/system ntp client\nset enabled=no\n";
    const after = "# 2026-09-26 02:00:04 by RouterOS 7.14.3\n/ip dns\nset servers=1.1.1.3\n/system ntp client\nset enabled=no\n";
    expect(diffExports(before, after)).toEqual({ added: ["set servers=1.1.1.3"], removed: ["set servers=8.8.8.8"] });
  });

  it("counts repeated lines", () => {
    expect(diffExports("add a\nadd a\n", "add a\n")).toEqual({ added: [], removed: ["add a"] });
  });
});
