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
