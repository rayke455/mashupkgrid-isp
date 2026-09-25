import { describe, expect, it, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));

import { voucherSmsMessage } from "../voucher-sms.js";

describe("voucherSmsMessage", () => {
  it("names the ISP, the code and the package", () => {
    const text = voucherSmsMessage("Demo ISP", { code: "ABCD2345", packageName: "1 Hour" });
    expect(text).toBe(
      "Demo ISP Wi-Fi: your code is ABCD2345 for 1 Hour. Lost connection? Join the Wi-Fi, open any page and enter this code."
    );
  });

  it("stays within one SMS and never cuts the code, however long the names are", () => {
    const text = voucherSmsMessage("A".repeat(80), { code: "ZXCV9876", packageName: "B".repeat(80) });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toContain("ZXCV9876");
  });
});
