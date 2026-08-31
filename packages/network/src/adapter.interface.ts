/**
 * Vendor-agnostic network device contract (docs/architecture/06-network-mikrotik-radius.md).
 * `packages/radius` and the router API routes depend only on this — never on `MikroTikAdapter`
 * directly — so a future vendor is a new adapter, not a rewrite of every caller.
 */

export interface DeviceHealth {
  reachable: boolean;
  cpuLoadPercent?: number;
  memoryUsedBytes?: bigint;
  memoryTotalBytes?: bigint;
  uptimeSeconds?: number;
  identity?: string;
  version?: string;
  error?: string;
}

export interface DeviceSession {
  username: string;
  address?: string;
  uptime?: string;
  callerId?: string;
  /** Cumulative bytes for this session so far, straight from the router's own live counters —
   *  only populated where the vendor tracks it per-session (MikroTik hotspot does via
   *  bytes-in/bytes-out; PPPoE active sessions don't expose this the same way). */
  bytesIn?: number;
  bytesOut?: number;
}

export interface NetworkUserSpec {
  username: string;
  password: string;
  profile?: string;
  /** "download/upload" formatted rate limit, vendor-specific (MikroTik: "1M/1M"). */
  rateLimit?: string;
  comment?: string;
}

/** An 802.1Q VLAN interface as it actually exists on a device. Every field is what the device
 *  reported, never what this system believes it configured. */
export interface DeviceVlanInterface {
  /** Vendor's own handle for the row (MikroTik `.id`), needed to edit or remove it. */
  id: string;
  name: string;
  vlanId: number;
  /** The parent interface the VLAN is stacked on — a bridge, an ethernet port, whatever the
   *  operator actually built. Never assumed: topology is the ISP's, not ours. */
  parentInterface: string;
  mtu?: number;
  disabled: boolean;
  running?: boolean;
  comment?: string;
}

export interface CreateVlanInterfaceSpec {
  name: string;
  vlanId: number;
  parentInterface: string;
  mtu?: number;
  comment?: string;
}

export interface DeviceIpPool {
  id: string;
  name: string;
  ranges: string;
}

/** A bandwidth/service profile that must already exist on the device. This system reads them to
 *  VERIFY a package's configured profile is real before provisioning against it; it does not
 *  invent profiles an operator did not create. */
export interface DeviceProfile {
  id: string;
  name: string;
  rateLimit?: string;
}

export interface NetworkDeviceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<DeviceHealth>;
  getActiveSessions(): Promise<DeviceSession[]>;
  createUser(user: NetworkUserSpec): Promise<void>;
  updateUser(username: string, patch: Partial<NetworkUserSpec>): Promise<void>;
  disableUser(username: string): Promise<void>;
  enableUser(username: string): Promise<void>;
  disconnectUser(username: string): Promise<void>;
  /** Kicks every currently active session (PPPoE and hotspot both, where the vendor
   *  distinguishes them) — for bulk maintenance/incident response, not a per-user action.
   *  Returns how many sessions were actually removed. */
  disconnectAllSessions(): Promise<number>;
  // --- VLAN and addressing (spec section 9) -------------------------------------------------
  // Optional on the interface: a vendor whose adapter cannot do these must not be forced to
  // pretend. Callers check for the method and report "unsupported on this device" rather than
  // silently skipping the step and reporting success.

  /** Every VLAN interface the device currently has. The authority on what exists — this system's
   *  own `vlans` table is intent, not fact. */
  listVlanInterfaces?(): Promise<DeviceVlanInterface[]>;
  createVlanInterface?(spec: CreateVlanInterfaceSpec): Promise<DeviceVlanInterface>;
  updateVlanInterface?(name: string, patch: Partial<CreateVlanInterfaceSpec>): Promise<DeviceVlanInterface>;
  setVlanInterfaceEnabled?(name: string, enabled: boolean): Promise<DeviceVlanInterface>;
  /** Destructive. Implementations must confirm the target exists and matches what the caller
   *  expects before removing anything (spec section 9). */
  removeVlanInterface?(name: string, expectedVlanId: number): Promise<void>;

  /** Interfaces available to stack a VLAN on. Read so an operator can PICK their own parent
   *  rather than this system guessing at "bridge". */
  listInterfaces?(): Promise<Array<{ name: string; type: string; running: boolean }>>;

  listIpPools?(): Promise<DeviceIpPool[]>;
  upsertIpPool?(name: string, ranges: string): Promise<DeviceIpPool>;

  /** Adds an address to an interface, e.g. a VLAN's gateway. Idempotent by (address, interface). */
  assignIpAddress?(interfaceName: string, addressCidr: string): Promise<void>;

  /** PPPoE profiles present on the device, used to verify a package's `pppoeProfile` actually
   *  exists before a provisioning job claims to have applied it. */
  listPppProfiles?(): Promise<DeviceProfile[]>;
  listHotspotProfiles?(): Promise<DeviceProfile[]>;

  applySpeedtestBoost?(): Promise<{ success: boolean; message: string }>;
  enforceStrictTimeout?(): Promise<{ success: boolean; cookiesRemoved: number; message: string }>;
}

/** Thrown by every not-yet-implemented vendor adapter — never pretend an unsupported
 *  integration works (project instruction §20/§78). */
export class NotImplementedError extends Error {
  constructor(vendor: string) {
    super(`The "${vendor}" adapter is not implemented yet.`);
    this.name = "NotImplementedError";
  }
}
