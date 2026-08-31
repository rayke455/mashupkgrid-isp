import { RouterOSClient } from "./routeros-client.js";
import type {
  NetworkDeviceAdapter,
  NetworkUserSpec,
  DeviceHealth,
  DeviceSession,
  DeviceVlanInterface,
  CreateVlanInterfaceSpec,
  DeviceIpPool,
  DeviceProfile,
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
  // --- VLAN and addressing (spec section 9) ---------------------------------------------------
  // Every method here reports what the DEVICE said. None of them assume a topology: the parent
  // interface a VLAN stacks on is always supplied by the caller, because it is the ISP's network
  // design and not something this system may guess at.

  async listVlanInterfaces(): Promise<DeviceVlanInterface[]> {
    const rows = await this.requireClient().print(["/interface/vlan/print"]);
    return rows.map((r) => parseVlanInterfaceRow(r));
  }

  private async findVlanRow(name: string): Promise<Record<string, string> | null> {
    const rows = await this.requireClient().print(["/interface/vlan/print", `?name=${name}`]);
    return rows[0] ?? null;
  }

  async createVlanInterface(spec: CreateVlanInterfaceSpec): Promise<DeviceVlanInterface> {
    // Validate the parent exists before adding. RouterOS would reject an unknown interface
    // anyway, but its error is terse; naming the real problem is what lets an admin fix it.
    const parents = await this.requireClient().print([
      "/interface/print",
      `?name=${spec.parentInterface}`,
    ]);
    if (parents.length === 0) {
      throw new Error(
        `Interface "${spec.parentInterface}" does not exist on this router - pick one of its real interfaces to carry the VLAN.`
      );
    }

    const words = [
      "/interface/vlan/add",
      `=name=${spec.name}`,
      `=vlan-id=${spec.vlanId}`,
      `=interface=${spec.parentInterface}`,
    ];
    if (spec.mtu) words.push(`=mtu=${spec.mtu}`);
    if (spec.comment) words.push(`=comment=${spec.comment}`);
    await this.requireClient().talk(words);

    // Read back rather than returning what we sent. If the device normalized or quietly altered
    // anything, the caller must see the device's version, not our optimistic one.
    const created = await this.findVlanRow(spec.name);
    if (!created) {
      throw new Error(`Router accepted VLAN "${spec.name}" but it is absent on read-back.`);
    }
    return parseVlanInterfaceRow(created);
  }

  async updateVlanInterface(
    name: string,
    patch: Partial<CreateVlanInterfaceSpec>
  ): Promise<DeviceVlanInterface> {
    const row = await this.findVlanRow(name);
    if (!row) throw new Error(`No VLAN interface named "${name}" on this router.`);

    const words = ["/interface/vlan/set", `=.id=${row[".id"]}`];
    if (patch.name !== undefined) words.push(`=name=${patch.name}`);
    if (patch.vlanId !== undefined) words.push(`=vlan-id=${patch.vlanId}`);
    if (patch.parentInterface !== undefined) words.push(`=interface=${patch.parentInterface}`);
    if (patch.mtu !== undefined) words.push(`=mtu=${patch.mtu}`);
    if (patch.comment !== undefined) words.push(`=comment=${patch.comment}`);
    if (words.length === 2) return parseVlanInterfaceRow(row); // nothing asked to change

    await this.requireClient().talk(words);
    const after = await this.findVlanRow(patch.name ?? name);
    if (!after) throw new Error(`VLAN "${name}" vanished from the router during update.`);
    return parseVlanInterfaceRow(after);
  }

  async setVlanInterfaceEnabled(name: string, enabled: boolean): Promise<DeviceVlanInterface> {
    const row = await this.findVlanRow(name);
    if (!row) throw new Error(`No VLAN interface named "${name}" on this router.`);
    await this.requireClient().talk([
      enabled ? "/interface/vlan/enable" : "/interface/vlan/disable",
      `=.id=${row[".id"]}`,
    ]);
    const after = await this.findVlanRow(name);
    if (!after) throw new Error(`VLAN "${name}" vanished from the router.`);
    return parseVlanInterfaceRow(after);
  }

  /**
   * Removing a VLAN interface drops every subscriber riding it, so the target is confirmed twice
   * before anything is deleted: it must exist, AND its vlan-id must match what the caller
   * believes it is removing. A name collision, or a VLAN re-tagged on the device by hand, would
   * otherwise make this delete the wrong interface (spec section 9: validate the target and
   * configuration before destructive network changes).
   */
  async removeVlanInterface(name: string, expectedVlanId: number): Promise<void> {
    const row = await this.findVlanRow(name);
    if (!row) return; // already absent - removal is idempotent
    const actual = Number(row["vlan-id"] ?? 0);
    if (actual !== expectedVlanId) {
      throw new Error(
        `Refusing to remove "${name}": this router has it as VLAN ${actual}, not VLAN ${expectedVlanId}. ` +
          `It was changed on the device - reconcile before removing.`
      );
    }
    await this.requireClient().talk(["/interface/vlan/remove", `=.id=${row[".id"]}`]);
  }

  async listInterfaces(): Promise<Array<{ name: string; type: string; running: boolean }>> {
    const rows = await this.requireClient().print(["/interface/print"]);
    return rows.map((r) => ({
      name: r["name"] ?? "",
      type: r["type"] ?? "",
      running: r["running"] === "true",
    }));
  }

  async listIpPools(): Promise<DeviceIpPool[]> {
    const rows = await this.requireClient().print(["/ip/pool/print"]);
    return rows.map((r) => ({
      id: r[".id"] ?? "",
      name: r["name"] ?? "",
      ranges: r["ranges"] ?? "",
    }));
  }

  /** Idempotent by pool name: re-running a provisioning job must not stack duplicate pools,
   *  which is the requirement spec section 18 places on every job. */
  async upsertIpPool(name: string, ranges: string): Promise<DeviceIpPool> {
    const existing = await this.requireClient().print(["/ip/pool/print", `?name=${name}`]);
    if (existing[0]) {
      await this.requireClient().talk([
        "/ip/pool/set",
        `=.id=${existing[0][".id"]}`,
        `=ranges=${ranges}`,
      ]);
    } else {
      await this.requireClient().talk(["/ip/pool/add", `=name=${name}`, `=ranges=${ranges}`]);
    }
    const rows = await this.requireClient().print(["/ip/pool/print", `?name=${name}`]);
    const row = rows[0];
    if (!row) throw new Error(`IP pool "${name}" is absent on read-back.`);
    return { id: row[".id"] ?? "", name: row["name"] ?? "", ranges: row["ranges"] ?? "" };
  }

  /** Idempotent by (address, interface) so a retried job does not add the same gateway twice. */
  async assignIpAddress(interfaceName: string, addressCidr: string): Promise<void> {
    const existing = await this.requireClient().print([
      "/ip/address/print",
      `?address=${addressCidr}`,
      `?interface=${interfaceName}`,
    ]);
    if (existing.length > 0) return;
    await this.requireClient().talk([
      "/ip/address/add",
      `=address=${addressCidr}`,
      `=interface=${interfaceName}`,
    ]);
  }

  async listPppProfiles(): Promise<DeviceProfile[]> {
    const rows = await this.requireClient().print(["/ppp/profile/print"]);
    return rows.map((r) => ({
      id: r[".id"] ?? "",
      name: r["name"] ?? "",
      ...(r["rate-limit"] ? { rateLimit: r["rate-limit"] } : {}),
    }));
  }

  async listHotspotProfiles(): Promise<DeviceProfile[]> {
    const rows = await this.requireClient().print(["/ip/hotspot/user/profile/print"]);
    return rows.map((r) => ({
      id: r[".id"] ?? "",
      name: r["name"] ?? "",
      ...(r["rate-limit"] ? { rateLimit: r["rate-limit"] } : {}),
    }));
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

/**
 * Maps one `/interface/vlan/print` row to the vendor-agnostic shape. Exported so it can be tested
 * against real captured RouterOS output without a device on the network — the field names and the
 * string-typed booleans below were taken from a live hAP lite on RouterOS 7.12.1, not from docs.
 */
export function parseVlanInterfaceRow(row: Record<string, string>): DeviceVlanInterface {
  return {
    id: row[".id"] ?? "",
    name: row["name"] ?? "",
    vlanId: Number(row["vlan-id"] ?? 0),
    parentInterface: row["interface"] ?? "",
    ...(row["mtu"] ? { mtu: Number(row["mtu"]) } : {}),
    // RouterOS sends these as the STRINGS "true"/"false". A truthiness check would read every
    // row as disabled, since the non-empty string "false" is truthy in JavaScript.
    disabled: row["disabled"] === "true",
    ...(row["running"] !== undefined ? { running: row["running"] === "true" } : {}),
    ...(row["comment"] ? { comment: row["comment"] } : {}),
  };
}
