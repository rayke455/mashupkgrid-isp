import { describe, it, expect } from "vitest";
import { parseCallbackMetadata } from "../callback.service.js";

describe("parseCallbackMetadata", () => {
  it("extracts amount (converted to minor units), receipt number, and phone", () => {
    const result = parseCallbackMetadata([
      { Name: "Amount", Value: 1000 },
      { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
      { Name: "TransactionDate", Value: 20191219102115 },
      { Name: "PhoneNumber", Value: 254708374149 },
    ]);

    expect(result).toEqual({
      amountMinor: 100_000,
      mpesaReceiptNumber: "NLJ7RT61SV",
      phone: "254708374149",
    });
  });

  it("returns an empty object for undefined items (a failed/cancelled callback)", () => {
    expect(parseCallbackMetadata(undefined)).toEqual({});
  });

  it("returns an empty object for an empty items array", () => {
    expect(parseCallbackMetadata([])).toEqual({});
  });

  it("ignores unknown item names", () => {
    const result = parseCallbackMetadata([{ Name: "SomethingElse", Value: "whatever" }]);
    expect(result).toEqual({});
  });

  it("ignores a non-numeric Amount value defensively", () => {
    const result = parseCallbackMetadata([{ Name: "Amount", Value: "not-a-number" as unknown as number }]);
    expect(result.amountMinor).toBeUndefined();
  });
});
