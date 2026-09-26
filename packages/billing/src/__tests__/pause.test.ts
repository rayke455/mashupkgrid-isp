import { describe, it, expect } from "vitest";
import { unusedPauseDays } from "../pause.service.js";

const DAY = 86_400_000;
const start = new Date("2026-10-01T08:00:00Z");
const after = (ms: number) => new Date(start.getTime() + ms);

describe("unusedPauseDays", () => {
  it("gives every day back when resumed within the first day", () => {
    expect(unusedPauseDays(7, start, after(10_000))).toBe(7);
    expect(unusedPauseDays(7, start, after(DAY - 1))).toBe(7);
  });

  it("counts only whole days spent paused", () => {
    expect(unusedPauseDays(7, start, after(DAY))).toBe(6);
    expect(unusedPauseDays(7, start, after(3.5 * DAY))).toBe(4);
  });

  it("gives nothing back once the pause has run its course", () => {
    expect(unusedPauseDays(7, start, after(7 * DAY))).toBe(0);
    expect(unusedPauseDays(7, start, after(9 * DAY))).toBe(0);
  });
});
