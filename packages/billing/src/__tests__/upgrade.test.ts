import { describe, it, expect } from "vitest";
import { pickUpgradeTarget, upgradeSuggestionSms, type PackageOption } from "../upgrade.service.js";

const pkg = (id: string, priceMinor: number, dataCapMb: number | null, downloadKbps = 10_000, extra: Partial<PackageOption> = {}): PackageOption => ({
  id, name: id, priceMinor, dataCapMb, downloadKbps, billingCycle: "MONTHLY", isActive: true, ...extra,
});

describe("pickUpgradeTarget", () => {
  const current = pkg("home10", 200_000, 51_200);

  it("picks the cheapest bigger plan", () => {
    const options = [current, pkg("home20", 300_000, 102_400, 20_000), pkg("home15", 250_000, 76_800, 15_000), pkg("biz", 900_000, null, 50_000)];
    expect(pickUpgradeTarget(current, options)?.id).toBe("home15");
  });

  it("skips plans that are slower, smaller, inactive, cheaper or billed differently", () => {
    const options = [
      pkg("slower", 300_000, 102_400, 5_000),
      pkg("same-cap", 300_000, 51_200, 20_000),
      pkg("off", 300_000, null, 20_000, { isActive: false }),
      pkg("cheaper", 150_000, null, 20_000),
      pkg("weekly", 300_000, null, 20_000, { billingCycle: "WEEKLY" }),
    ];
    expect(pickUpgradeTarget(current, options)).toBeNull();
  });

  it("accepts an unlimited plan", () => {
    expect(pickUpgradeTarget(current, [pkg("unlimited", 400_000, null, 10_000)])?.id).toBe("unlimited");
  });
});

describe("upgradeSuggestionSms", () => {
  it("fits one SMS and names both plans and the price", () => {
    const sms = upgradeSuggestionSms({ firstName: "Jane", isp: "Demo ISP", usedMb: 48_640, capMb: 51_200, fromPackage: "Home 10", toPackage: "Home 20", price: "KES 3,000.00 a month" });
    expect(sms).toContain("48 GB of your 50 GB on Home 10");
    expect(sms).toContain("Home 20");
    expect(sms.length).toBeLessThanOrEqual(160 * 2);
  });
});
