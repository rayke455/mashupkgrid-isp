import { describe, expect, it, vi } from "vitest";
import { ANTI_TUNNEL_RESULT_VAR, ANTI_TUNNEL_TAG, antiTunnelRules, buildAntiTunnelScript } from "../anti-tunnel.js";
import { MikroTikAdapter } from "../mikrotik/mikrotik.adapter.js";

describe("tunnel blocking rules", () => {
  const rules = antiTunnelRules();

  it("only ever touches phones that haven't logged in", () => {
    for (const r of rules) expect(r.words).toContain("=hotspot=from-client,!auth");
  });

  it("lets normal DNS through before dropping the rest", () => {
    const at = (purpose: string) => rules.findIndex((r) => r.purpose === purpose);
    expect(at("allow normal DNS")).toBeGreaterThan(at("drop oversized DNS queries (tunnel data)"));
    expect(at("allow normal DNS")).toBeLessThan(at("drop DNS floods"));
    expect(at("allow occasional DNS over TCP")).toBeLessThan(at("drop DNS-over-TCP floods"));
  });

  it("limits new connections generously, so the sign-in page still loads", () => {
    const limit = rules.find((r) => r.words.some((w) => w.startsWith("=connection-limit=")))!;
    expect(limit.words).toContain("=connection-state=new");
    expect(Number(limit.words.find((w) => w.startsWith("=connection-limit="))!.split("=")[2]!.split(",")[0])).toBeGreaterThanOrEqual(30);
  });
});

describe("the router script", () => {
  const on = buildAntiTunnelScript(true);

  it("adds every rule inside one all-or-nothing block that cleans up on failure", () => {
    const mainBlockEnd = on.indexOf("\n} on-error={\n");
    const block = on.slice(on.indexOf(":do {\n"), mainBlockEnd);
    expect(block.split("\n").filter((l) => l.includes(" add "))).toHaveLength(antiTunnelRules().length);
    const onError = on.slice(mainBlockEnd);
    expect(onError).toContain(`remove [find where comment~"ANTI-VPN|ANTI-TUNNEL"]`);
    expect(onError).toContain(`:set ${ANTI_TUNNEL_RESULT_VAR} "failed"`);
  });

  it("quotes values with spaces so RouterOS reads them as one value", () => {
    expect(on).toContain('content="Upgrade: websocket"');
    expect(on).toContain('content="CONNECT "');
    expect(on).toContain("hotspot=from-client,!auth");
    expect(on).not.toMatch(/hotspot=!auth/);
  });

  it("turning off only removes, and still reports back", () => {
    const off = buildAntiTunnelScript(false);
    expect(off).not.toContain(" add ");
    expect(off).toContain(`:set ${ANTI_TUNNEL_RESULT_VAR} "ok"`);
  });
});

/** A router whose script outcome is `outcome` ("running" while it works, "never" when the
 *  variable isn't there yet, "busy" when it can't answer), holding `tagged` rules after the script
 *  runs and `before` before. */
function fakeRouter(outcome: "running" | "ok" | "failed" | "never" | "busy", tagged: number, before = 0) {
  const scripts: string[] = [];
  let current = before;
  const client = {
    print: vi.fn(async (words: string[]) => {
      if (words[0] === "/system/script/environment/print") {
        if (outcome === "busy") throw new Error("Timed out waiting for a reply");
        return outcome === "never" ? [] : [{ name: ANTI_TUNNEL_RESULT_VAR, value: outcome }];
      }
      if (words[0] === "/ip/firewall/filter/print") return Array.from({ length: current }, (_, i) => ({ ".id": `*${i}`, comment: ANTI_TUNNEL_TAG }));
      return [];
    }),
    talk: vi.fn(async (words: string[]) => {
      if (words[0] === "/execute") {
        scripts.push(words[1]!.replace("=script=", ""));
        current = tagged;
      }
      return [{ type: "!done", attributes: {} }];
    }),
  };
  const adapter = new MikroTikAdapter({ host: "h", port: 8728, useTls: false, username: "u", password: "p" });
  (adapter as unknown as { client: unknown }).client = client;
  return { adapter, scripts };
}

describe("turning tunnel blocking on and off", () => {
  const n = antiTunnelRules().length;

  it("starts the script on the router without waiting for it", async () => {
    const { adapter, scripts } = fakeRouter("running", n);
    expect(await adapter.startAntiTunnelShield(true)).toEqual({ started: true });
    expect(scripts).toEqual([buildAntiTunnelScript(true)]);
  });

  it("leaves a router that already has every rule alone", async () => {
    const { adapter, scripts } = fakeRouter("ok", n, n);
    expect(await adapter.startAntiTunnelShield(true)).toEqual({ started: false });
    expect(scripts).toEqual([]);
  });

  it("reports what the router recorded: working, done with its rule count, or failed", async () => {
    expect(await fakeRouter("running", 0).adapter.getAntiTunnelStatus()).toMatchObject({ state: "applying" });
    expect(await fakeRouter("ok", 0, n).adapter.getAntiTunnelStatus()).toEqual({ state: "done", rules: n, expected: n });
    expect(await fakeRouter("failed", 0).adapter.getAntiTunnelStatus()).toMatchObject({ state: "failed", rules: 0 });
  });

  it("says unknown, never done, while the router is too busy to answer", async () => {
    expect(await fakeRouter("busy", 0).adapter.getAntiTunnelStatus()).toMatchObject({ state: "unknown", rules: null });
  });

  it("says unknown, never done or off, when the router has no record of the change", async () => {
    expect(await fakeRouter("never", 0).adapter.getAntiTunnelStatus()).toMatchObject({ state: "unknown" });
  });

  it("turning off runs the removal script even when nothing is there", async () => {
    const { adapter, scripts } = fakeRouter("ok", 0);
    expect(await adapter.startAntiTunnelShield(false)).toEqual({ started: true });
    expect(scripts[0]).toBe(buildAntiTunnelScript(false));
  });
});
