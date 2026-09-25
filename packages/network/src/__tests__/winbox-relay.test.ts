import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));

import { allocateRelayPort, parsePortRange, sourceMatcher, startWinboxRelay, type WinboxRelayHandle } from "../winbox-relay.service.js";

/** A stand-in for a router's WinBox service: echoes whatever it receives, prefixed with its name. */
function fakeRouter(name: string): Promise<{ port: number; server: net.Server }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.on("data", (d) => socket.write(`${name}:${d.toString()}`)));
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as net.AddressInfo).port, server }));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

function roundTrip(port: number, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let data = "";
    socket.on("data", (d) => {
      data += d.toString();
      socket.end();
    });
    socket.on("close", () => resolve(data));
    socket.on("error", reject);
    socket.write(message);
  });
}

describe("WinBox relay", () => {
  const cleanup: Array<() => Promise<unknown> | void> = [];
  afterEach(async () => {
    for (const fn of cleanup.splice(0)) await fn();
  });

  it("parses a port range and refuses nonsense", () => {
    expect(parsePortRange("20000-20999")).toEqual({ start: 20000, end: 20999 });
    expect(() => parsePortRange("20999-20000")).toThrow();
    expect(() => parsePortRange("80-90")).toThrow(); // privileged ports
    expect(() => parsePortRange("20000")).toThrow();
  });

  it("allocates the lowest free port and reports exhaustion", () => {
    expect(allocateRelayPort("20000-20003", [])).toBe(20000);
    expect(allocateRelayPort("20000-20003", [20000, 20002])).toBe(20001);
    expect(() => allocateRelayPort("20000-20001", [20000, 20001])).toThrow(/exhausted/);
  });

  it("matches sources against addresses and CIDRs; an empty list allows everyone", () => {
    const office = sourceMatcher("41.90.1.10, 10.0.0.0/8");
    expect(office("41.90.1.10")).toBe(true);
    expect(office("::ffff:41.90.1.10")).toBe(true);
    expect(office("10.4.5.6")).toBe(true);
    expect(office("41.90.1.11")).toBe(false);
    expect(sourceMatcher("")("203.0.113.9")).toBe(true);
    expect(() => sourceMatcher("not-an-ip")).toThrow();
  });

  it("relays each public port to its own router, and follows a router to a new address", async () => {
    const a = await fakeRouter("A");
    const b = await fakeRouter("B");
    cleanup.push(() => new Promise((r) => a.server.close(r)), () => new Promise((r) => b.server.close(r)));
    const portA = await freePort();
    const portB = await freePort();
    // One target port for the whole relay, as in production (8291); here each fake router gets
    // its own loopback alias instead, so give them distinct hosts via separate relays.
    let targets = [{ port: portA, host: "127.0.0.1", label: "router A" }];
    const relayA: WinboxRelayHandle = startWinboxRelay({ loadTargets: async () => targets, targetPort: a.port, bindHost: "127.0.0.1", refreshMs: 60_000, log: () => {} });
    const relayB: WinboxRelayHandle = startWinboxRelay({
      loadTargets: async () => [{ port: portB, host: "127.0.0.1", label: "router B" }],
      targetPort: b.port,
      bindHost: "127.0.0.1",
      refreshMs: 60_000,
      log: () => {},
    });
    cleanup.push(() => relayA.close(), () => relayB.close());
    await relayA.refresh();
    await relayB.refresh();

    expect(await roundTrip(portA, "hello")).toBe("A:hello");
    expect(await roundTrip(portB, "hello")).toBe("B:hello");

    // The router drops off the VPN: its port is closed on the next refresh.
    targets = [];
    await relayA.refresh();
    expect(relayA.listening()).toEqual([]);
    await expect(roundTrip(portA, "hello")).rejects.toThrow();
  });

  it("refuses a source outside the allowlist before contacting the router", async () => {
    const router = await fakeRouter("R");
    const contacted = vi.fn();
    router.server.on("connection", contacted);
    cleanup.push(() => new Promise((r) => router.server.close(r)));
    const port = await freePort();
    const relay = startWinboxRelay({
      loadTargets: async () => [{ port, host: "127.0.0.1", label: "router" }],
      allowedSources: "203.0.113.0/24",
      targetPort: router.port,
      bindHost: "127.0.0.1",
      refreshMs: 60_000,
      log: () => {},
    });
    cleanup.push(() => relay.close());
    await relay.refresh();
    expect(await roundTrip(port, "hello")).toBe("");
    expect(contacted).not.toHaveBeenCalled();
  });
});
