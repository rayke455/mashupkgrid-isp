import { describe, it, expect } from "vitest";
import { darajaTimestamp, darajaPassword } from "../daraja-client.js";

describe("darajaTimestamp", () => {
  it("formats as YYYYMMDDHHmmss with zero-padding", () => {
    const date = new Date(2026, 0, 5, 3, 7, 9); // Jan 5 2026, 03:07:09 local
    expect(darajaTimestamp(date)).toBe("20260105030709");
  });

  it("produces a 14-digit numeric string", () => {
    expect(darajaTimestamp()).toMatch(/^\d{14}$/);
  });
});

describe("darajaPassword", () => {
  it("base64-encodes shortcode+passkey+timestamp concatenated", () => {
    const password = darajaPassword("174379", "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919", "20191219102115");
    const decoded = Buffer.from(password, "base64").toString("utf8");
    expect(decoded).toBe("174379bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c91920191219102115");
  });

  it("is deterministic for the same inputs", () => {
    const a = darajaPassword("174379", "passkey", "20260101000000");
    const b = darajaPassword("174379", "passkey", "20260101000000");
    expect(a).toBe(b);
  });

  it("changes when the timestamp changes", () => {
    const a = darajaPassword("174379", "passkey", "20260101000000");
    const b = darajaPassword("174379", "passkey", "20260101000001");
    expect(a).not.toBe(b);
  });
});
