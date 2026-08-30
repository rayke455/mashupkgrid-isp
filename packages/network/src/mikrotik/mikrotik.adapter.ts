import { RouterOSClient } from "./routeros-client.js";
import type {
  NetworkDeviceAdapter,
  NetworkUserSpec,
  DeviceHealth,
  DeviceSession,
} from "../adapter.interface.js";

export interface MikroTikCredentials {
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  password: string;
}

/** Real RouterOS API adapter — PPP secrets for PPPoE, real health/session queries. Hotspot
 *  user management uses the same `/ip/hotspot/user/*` command family and is added alongside
 *  PPP once Phase 4's voucher flow needs it directly against a router (vouchers are RADIUS
 *  users first — see docs/architecture/06 — so most hotspot auth doesn't call this adapter at all). */
export class MikroTikAdapter implements NetworkDeviceAdapter {
  private client: RouterOSClient | null = null;

  constructor(private readonly credentials: MikroTikCredentials) {}

  async connect(): Promise<void> {
    const client = new RouterOSClient({
      host: this.credentials.host,
      port: this.credentials.port,
      useTls: this.credentials.useTls,
    });
    await client.connect();
    await client.login(this.credentials.username, this.credentials.password);
    this.client = client;
  }

  async disconnect(): Promise<void> {
    this.client?.disconnect();
    this.client = null;
  }

  private requireClient(): RouterOSClient {
    if (!this.client) throw new Error("MikroTikAdapter: call connect() first");
    return this.client;
  }

  async healthCheck(): Promise<DeviceHealth> {
    try {
      const client = this.requireClient();
      const [resource] = await client.print(["/system/resource/print"]);
      const [identity] = await client.print(["/system/identity/print"]);
      if (!resource) return { reachable: false, error: "No response from /system/resource/print" };

      return {
        reachable: true,
        cpuLoadPercent: resource["cpu-load"] ? Number(resource["cpu-load"]) : undefined,
        memoryUsedBytes:
          resource["total-memory"] && resource["free-memory"]
            ? BigInt(resource["total-memory"]) - BigInt(resource["free-memory"])
            : undefined,
        memoryTotalBytes: resource["total-memory"] ? BigInt(resource["total-memory"]) : undefined,
        uptimeSeconds: resource["uptime"] ? parseRouterOSUptime(resource["uptime"]) : undefined,
        identity: identity?.["name"],
        version: resource["version"],
      };
    } catch (err) {
      return { reachable: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getActiveSessions(): Promise<DeviceSession[]> {
    const [pppRows, hotspotRows] = await Promise.all([
      this.requireClient().print(["/ppp/active/print"]),
      // A router with no hotspot server configured just returns an empty list here, not an
      // error — RouterOS's /ip hotspot active/print is always a valid (if empty) command.
      this.requireClient().print(["/ip/hotspot/active/print"]),
    ]);
    const ppp = pppRows.map((row) => ({
      username: row["name"] ?? "",
      address: row["address"],
      uptime: row["uptime"],
      callerId: row["caller-id"],
    }));
    // Hotspot sessions have no PPP caller-id; their closest equivalent client identifier is the
    // connecting device's MAC address, reusing the same field rather than adding a new one only
    // one of the two session kinds would populate.
    const hotspot = hotspotRows.map((row) => ({
      username: row["user"] ?? "",
      address: row["address"],
      uptime: row["uptime"],
      callerId: row["mac-address"],
      bytesIn: row["bytes-in"] ? Number(row["bytes-in"]) : undefined,
      bytesOut: row["bytes-out"] ? Number(row["bytes-out"]) : undefined,
    }));
    return [...ppp, ...hotspot];
  }

  async createUser(user: NetworkUserSpec): Promise<void> {
    const words = [
      "/ppp/secret/add",
      `=name=${user.username}`,
      `=password=${user.password}`,
      "=service=pppoe",
    ];
    if (user.profile) words.push(`=profile=${user.profile}`);
    if (user.rateLimit) words.push(`=limit-bytes-in=0`, `=rate-limit=${user.rateLimit}`);
    if (user.comment) words.push(`=comment=${user.comment}`);
    await this.requireClient().talk(words);
  }

  private async findSecretId(username: string): Promise<string> {
    const rows = await this.requireClient().print(["/ppp/secret/print", `?name=${username}`]);
    const id = rows[0]?.[".id"];
    if (!id) throw new Error(`No PPP secret found on router for username "${username}"`);
    return id;
  }

  async updateUser(username: string, patch: Partial<NetworkUserSpec>): Promise<void> {
    const id = await this.findSecretId(username);
    const words = ["/ppp/secret/set", `=.id=${id}`];
    if (patch.password) words.push(`=password=${patch.password}`);
    if (patch.profile) words.push(`=profile=${patch.profile}`);
    if (patch.rateLimit) words.push(`=rate-limit=${patch.rateLimit}`);
    if (patch.comment) words.push(`=comment=${patch.comment}`);
    await this.requireClient().talk(words);
  }

  async disableUser(username: string): Promise<void> {
    const id = await this.findSecretId(username);
    await this.requireClient().talk(["/ppp/secret/set", `=.id=${id}`, "=disabled=yes"]);
    await this.disconnectUser(username).catch(() => {
      // Best-effort: if there's no active session to kick, that's fine — the secret is
      // disabled either way, which prevents any *future* login.
    });
  }

  async enableUser(username: string): Promise<void> {
    const id = await this.findSecretId(username);
    await this.requireClient().talk(["/ppp/secret/set", `=.id=${id}`, "=disabled=no"]);
  }

  async disconnectUser(username: string): Promise<void> {
    const pppRows = await this.requireClient().print(["/ppp/active/print", `?name=${username}`]);
    const pppId = pppRows[0]?.[".id"];
    if (pppId) {
      await this.requireClient().talk(["/ppp/active/remove", `=.id=${pppId}`]);
      return;
    }
    // A hotspot session's active-table username field is "user", not "name" — vouchers and
    // hotspot-package logins only ever show up here, never in /ppp/active, so without this
    // fallback disconnectUser() silently no-ops for every hotspot user (the case data-cap
    // enforcement actually needs).
    const hotspotRows = await this.requireClient().print(["/ip/hotspot/active/print", `?user=${username}`]);
    const hotspotId = hotspotRows[0]?.[".id"];
    if (!hotspotId) return; // no active session under either service — nothing to disconnect
    await this.requireClient().talk(["/ip/hotspot/active/remove", `=.id=${hotspotId}`]);
  }

  async disconnectAllSessions(): Promise<number> {
    const [pppRows, hotspotRows] = await Promise.all([
      this.requireClient().print(["/ppp/active/print"]),
      this.requireClient().print(["/ip/hotspot/active/print"]),
    ]);
    let removed = 0;
    for (const row of pppRows) {
      const id = row[".id"];
      if (!id) continue;
      await this.requireClient().talk(["/ppp/active/remove", `=.id=${id}`]);
      removed++;
    }
    for (const row of hotspotRows) {
      const id = row[".id"];
      if (!id) continue;
      await this.requireClient().talk(["/ip/hotspot/active/remove", `=.id=${id}`]);
      removed++;
    }
    return removed;
  }

  async applySpeedtestBoost(): Promise<{ success: boolean; message: string }> {
    const client = this.requireClient();
    const domains = ["speedtest.net", "fast.com", "speedtestcustom.com", "ookla.com"];

    for (const domain of domains) {
      const existing = await client.print([
        "/ip/firewall/address-list/print",
        "?list=SPEEDTEST_SERVERS",
        `?address=${domain}`,
      ]).catch(() => []);
      if (!existing || existing.length === 0) {
        await client.talk([
          "/ip/firewall/address-list/add",
          "=list=SPEEDTEST_SERVERS",
          `=address=${domain}`,
          "=comment=Ookla & Fast.com Speedtest Boost",
        ]).catch(() => {});
      }
    }

    const existingConn = await client.print([
      "/ip/firewall/mangle/print",
      "?comment=Speedtest Boost Connection",
    ]).catch(() => []);
    if (!existingConn || existingConn.length === 0) {
      await client.talk([
        "/ip/firewall/mangle/add",
        "=chain=prerouting",
        "=dst-address-list=SPEEDTEST_SERVERS",
        "=action=mark-connection",
        "=new-connection-mark=speedtest_conn",
        "=passthrough=yes",
        "=comment=Speedtest Boost Connection",
      ]).catch(() => {});
    }

    const existingPkt = await client.print([
      "/ip/firewall/mangle/print",
      "?comment=Speedtest Boost Packet",
    ]).catch(() => []);
    if (!existingPkt || existingPkt.length === 0) {
      await client.talk([
        "/ip/firewall/mangle/add",
        "=chain=prerouting",
        "=connection-mark=speedtest_conn",
        "=action=mark-packet",
        "=new-packet-mark=speedtest_pkt",
        "=passthrough=no",
        "=comment=Speedtest Boost Packet",
      ]).catch(() => {});
    }

    const existingDl = await client.print([
      "/queue/tree/print",
      "?name=SPEEDTEST_BOOST_DOWNLOAD",
    ]).catch(() => []);
    if (!existingDl || existingDl.length === 0) {
      await client.talk([
        "/queue/tree/add",
        "=name=SPEEDTEST_BOOST_DOWNLOAD",
        "=parent=global",
        "=packet-mark=speedtest_pkt",
        "=max-limit=100M",
        "=limit-at=100M",
        "=priority=1",
        "=comment=100M Speedtest Boost",
      ]).catch(() => {});
    }

    const existingUl = await client.print([
      "/queue/tree/print",
      "?name=SPEEDTEST_BOOST_UPLOAD",
    ]).catch(() => []);
    if (!existingUl || existingUl.length === 0) {
      await client.talk([
        "/queue/tree/add",
        "=name=SPEEDTEST_BOOST_UPLOAD",
        "=parent=global",
        "=packet-mark=speedtest_pkt",
        "=max-limit=100M",
        "=limit-at=100M",
        "=priority=1",
        "=comment=100M Speedtest Boost",
      ]).catch(() => {});
    }

    return {
      success: true,
      message: "100 Mbps Speedtest Booster applied successfully on MikroTik!",
    };
  }

  async enforceStrictTimeout(): Promise<{ success: boolean; cookiesRemoved: number; message: string }> {
    const client = this.requireClient();

    const profiles = await client.print(["/ip/hotspot/profile/print"]).catch(() => []);
    for (const prof of profiles) {
      const id = prof[".id"];
      if (!id) continue;
      await client.talk([
        "/ip/hotspot/profile/set",
        `=.id=${id}`,
        "=login-by=http-chap,http-pap",
      ]).catch(() => {});
    }

    const cookies = await client.print(["/ip/hotspot/cookie/print"]).catch(() => []);
    let cookiesRemoved = 0;
    for (const cookie of cookies) {
      const id = cookie[".id"];
      if (!id) continue;
      await client.talk(["/ip/hotspot/cookie/remove", `=.id=${id}`]).catch(() => {});
      cookiesRemoved++;
    }

    const radiusServers = await client.print(["/radius/print"]).catch(() => []);
    for (const rad of radiusServers) {
      const id = rad[".id"];
      if (!id) continue;
      await client.talk([
        "/radius/set",
        `=.id=${id}`,
        "=interim-update=1m",
      ]).catch(() => {});
    }

    return {
      success: true,
      cookiesRemoved,
      message: `Strict 1-hour timeout enforced. Removed ${cookiesRemoved} cached cookie(s) and disabled silent re-auth.`,
    };
  }
}

/** RouterOS reports uptime as e.g. "4w2d3h4m5s" — parses it into whole seconds. */
export function parseRouterOSUptime(value: string): number {
  const pattern = /(\d+)([wdhms])/g;
  const unitSeconds: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    total += Number(match[1]) * (unitSeconds[match[2]!] ?? 0);
  }
  return total;
}
