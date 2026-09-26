import { describe, it, expect } from "vitest";
import { distanceKm, nearestSite } from "../coverage.service.js";

// These two points (Kasarani, Nairobi CBD) are about 11.2 km apart.
const kasarani = { name: "Kasarani", latitude: -1.2217, longitude: 36.8942 };
const cbd = { name: "CBD", latitude: -1.2864, longitude: 36.8172 };

describe("distanceKm", () => {
  it("measures real distances", () => {
    expect(distanceKm(kasarani.latitude, kasarani.longitude, cbd.latitude, cbd.longitude)).toBeGreaterThan(11);
    expect(distanceKm(kasarani.latitude, kasarani.longitude, cbd.latitude, cbd.longitude)).toBeLessThan(11.4);
    expect(distanceKm(1, 1, 1, 1)).toBe(0);
  });
});

describe("nearestSite", () => {
  it("is covered within the radius of the nearest site", () => {
    const near = nearestSite(-1.225, 36.9, [cbd, kasarani], 3);
    expect(near).toMatchObject({ covered: true, nearestSite: "Kasarani" });
    expect(near.distanceKm).toBeLessThan(1);
  });
  it("is not covered beyond it, and says how far", () => {
    const far = nearestSite(-1.1, 37.0, [kasarani], 3);
    expect(far.covered).toBe(false);
    expect(far.distanceKm).toBeGreaterThan(3);
  });
  it("can't say when the ISP has no router locations", () => {
    expect(nearestSite(-1.2, 36.9, [], 3)).toEqual({ covered: null, distanceKm: null, nearestSite: null, radiusKm: 3 });
  });
});
