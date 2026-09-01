import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { darajaBusinessShortCode, initiateStkPush } from "../daraja-client.js";
import type { MpesaCredentials } from "../config.service.js";

const base: MpesaCredentials = {
  consumerKey: "ck",
  consumerSecret: "cs",
  shortcode: "174379",
  shortcodeType: "PAYBILL",
  storeNumber: null,
  passkey: "passkey",
  environment: "sandbox",
};

describe("darajaBusinessShortCode", () => {
  it("uses the paybill itself for PAYBILL", () => {
    expect(darajaBusinessShortCode(base)).toBe("174379");
  });

  it("uses the store number, NOT the till, for TILL", () => {
    // The passkey is issued against the store number, so this is what signs the request.
    expect(
      darajaBusinessShortCode({ ...base, shortcodeType: "TILL", shortcode: "5678901", storeNumber: "4455667" })
    ).toBe("4455667");
  });

  it("falls back to the till when Safaricom issued no separate store number", () => {
    expect(
      darajaBusinessShortCode({ ...base, shortcodeType: "TILL", shortcode: "5678901", storeNumber: null })
    ).toBe("5678901");
  });
});

/** Captures the STK payload without reaching Safaricom. */
function mockDaraja(): () => Record<string, unknown> {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes("/oauth/")) {
        return { ok: true, json: async () => ({ access_token: "tok", expires_in: "3600" }) } as never;
      }
      captured = JSON.parse(init!.body!);
      return {
        ok: true,
        json: async () => ({
          MerchantRequestID: "m",
          CheckoutRequestID: "c",
          ResponseCode: "0",
          ResponseDescription: "ok",
          CustomerMessage: "ok",
        }),
      } as never;
    })
  );
  return () => captured;
}

const params = {
  phone: "254712345678",
  amountMinor: 15000,
  accountReference: "INV1",
  transactionDesc: "Internet",
  callbackUrl: "https://api.example.com/cb",
};

describe("initiateStkPush payload by shortcode type", () => {
  let read: () => Record<string, unknown>;
  beforeEach(() => {
    read = mockDaraja();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushes a Paybill as CustomerPayBillOnline with the paybill on both fields", async () => {
    await initiateStkPush({ ...params, credentials: { ...base, shortcode: "174379" } });
    const body = read();
    expect(body.TransactionType).toBe("CustomerPayBillOnline");
    expect(body.BusinessShortCode).toBe("174379");
    expect(body.PartyB).toBe("174379");
  });

  it("pushes a Till as CustomerBuyGoodsOnline, paying the till but signing with the store", async () => {
    // The regression this guards: every tenant used to be pushed as CustomerPayBillOnline, so a
    // Till tenant's STK request was accepted by Daraja and then never completed on the handset —
    // a silent failure with no error anywhere to explain it.
    await initiateStkPush({
      ...params,
      credentials: { ...base, shortcodeType: "TILL", shortcode: "5678901", storeNumber: "4455667" },
    });
    const body = read();
    expect(body.TransactionType).toBe("CustomerBuyGoodsOnline");
    expect(body.BusinessShortCode).toBe("4455667");
    expect(body.PartyB).toBe("5678901");
  });

  it("derives the STK password from the signing shortcode, not the till", async () => {
    await initiateStkPush({
      ...params,
      credentials: { ...base, shortcodeType: "TILL", shortcode: "5678901", storeNumber: "4455667" },
    });
    const body = read();
    const decoded = Buffer.from(String(body.Password), "base64").toString("utf8");
    expect(decoded.startsWith("4455667passkey")).toBe(true);
  });
});
