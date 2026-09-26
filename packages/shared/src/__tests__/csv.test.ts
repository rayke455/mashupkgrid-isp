import { describe, expect, it } from "vitest";
import { toCsv } from "../csv.js";

describe("toCsv", () => {
  const rows = [
    { name: 'Jane "JJ" Wanjiku', phone: "+254700000001", note: "=HYPERLINK(\"x\")", paid: 1500.5, joined: new Date("2026-01-02T03:04:05Z") },
    { name: "Otieno, Sam", phone: null, note: "line1\nline2", paid: 0, joined: null },
  ];
  const csv = toCsv(rows, [
    { header: "Name", value: (r) => r.name },
    { header: "Phone", value: (r) => r.phone },
    { header: "Note", value: (r) => r.note },
    { header: "Paid", value: (r) => r.paid },
    { header: "Joined", value: (r) => r.joined },
  ]);
  const lines = csv.split("\r\n");

  it("starts with a BOM so Excel reads UTF-8, and a header row", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe("﻿Name,Phone,Note,Paid,Joined");
  });

  it("quotes commas, quotes and newlines; leaves plain values bare; ISO dates; empty for null", () => {
    // The formula-guarded cell also contains quotes, so it is quoted as a whole.
    expect(lines[1]).toBe('"Jane ""JJ"" Wanjiku",+254700000001,"\'=HYPERLINK(""x"")",1500.5,2026-01-02T03:04:05.000Z');
    expect(lines[2]).toBe('"Otieno, Sam",,"line1\nline2",0,');
  });

  it("neutralises formula injection", () => {
    expect(lines[1]).toContain("'=HYPERLINK");
  });
});
