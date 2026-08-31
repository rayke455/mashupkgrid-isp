import { describe, it, expect } from "vitest";
import { assertNoTrap, RouterOSApiError } from "../mikrotik/routeros-client.js";
import type { Sentence } from "../mikrotik/protocol.js";

/**
 * Regression guard for the most dangerous class of bug this codebase has had.
 *
 * RouterOS reports a rejected command as a `!trap` sentence and then sends `!done` anyway.
 * `talk()` originally returned as soon as it saw `!done`, so every failed write resolved
 * successfully. Confirmed on a live RouterOS 7.12.1 box: `/ppp/secret/add` with an invalid
 * parameter created nothing and reported no error, which meant provisioning marked subscribers as
 * having network accounts that did not exist.
 *
 * The fixtures below are the exact sentences that router returned.
 */
describe("assertNoTrap", () => {
  it("throws on the real trap RouterOS 7.12.1 sends for an unknown parameter", () => {
    const captured: Sentence[] = [
      { type: "!trap", attributes: { tag: "17", message: "unknown parameter rate-limit" } },
      { type: "!done", attributes: { tag: "17" } },
    ];
    expect(() => assertNoTrap(captured, "/ppp/secret/add")).toThrow(RouterOSApiError);
    expect(() => assertNoTrap(captured, "/ppp/secret/add")).toThrow(/unknown parameter rate-limit/);
  });

  it("throws even though a !done follows the trap — that ordering is the whole trap", () => {
    // The bug was returning on !done without looking back at what preceded it.
    const captured: Sentence[] = [
      { type: "!trap", attributes: { message: "no such item" } },
      { type: "!done", attributes: {} },
    ];
    expect(() => assertNoTrap(captured, "/interface/vlan/remove")).toThrow(/no such item/);
  });

  it("surfaces the router's own words, not a message this system invented", () => {
    const captured: Sentence[] = [{ type: "!trap", attributes: { message: "input does not match any value of interface" } }];
    expect(() => assertNoTrap(captured, "/interface/vlan/add")).toThrow(
      "input does not match any value of interface"
    );
  });

  it("names the command when the router sends a trap with no message", () => {
    const captured: Sentence[] = [{ type: "!trap", attributes: {} }];
    expect(() => assertNoTrap(captured, "/ppp/secret/add")).toThrow(/RouterOS rejected \/ppp\/secret\/add/);
  });

  it("stays silent for a successful reply", () => {
    const ok: Sentence[] = [{ type: "!done", attributes: { ret: "*1" } }];
    expect(() => assertNoTrap(ok, "/ppp/secret/add")).not.toThrow();
  });

  it("stays silent for a normal print result", () => {
    const rows: Sentence[] = [
      { type: "!re", attributes: { ".id": "*1", name: "default" } },
      { type: "!re", attributes: { ".id": "*2", name: "default-encryption" } },
      { type: "!done", attributes: {} },
    ];
    expect(() => assertNoTrap(rows, "/ppp/profile/print")).not.toThrow();
  });
});
