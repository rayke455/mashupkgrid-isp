import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { isValidPaystackSignature } from "../webhook.service.js";

const SECRET = "sk_test_abc123";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("isValidPaystackSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "ref123" } });
    expect(isValidPaystackSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a payload signed with a different secret", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "ref123" } });
    expect(isValidPaystackSignature(body, sign(body, "sk_test_wrong"), SECRET)).toBe(false);
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const original = JSON.stringify({ event: "charge.success", data: { reference: "ref123", amount: 1000 } });
    const signature = sign(original);
    const tampered = JSON.stringify({ event: "charge.success", data: { reference: "ref123", amount: 999999 } });
    expect(isValidPaystackSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(isValidPaystackSignature(body, undefined, SECRET)).toBe(false);
  });
});
