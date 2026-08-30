import { NotImplementedError, type NetworkDeviceAdapter } from "./adapter.interface.js";

/** Every non-MikroTik vendor named in the product brief (Ubiquiti, TP-Link, Huawei, ZTE,
 *  Cambium, Cisco, Juniper, OLT vendors) gets this — every method throws clearly rather than
 *  silently no-op'ing, so a caller can never mistake "not implemented" for "succeeded"
 *  (project instruction §20/§78). */
export class StubAdapter implements NetworkDeviceAdapter {
  constructor(private readonly vendorName: string) {}

  async connect(): Promise<void> {
    throw new NotImplementedError(this.vendorName);
  }
  async disconnect(): Promise<void> {
    throw new NotImplementedError(this.vendorName);
  }
  async healthCheck(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
  async getActiveSessions(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
  async createUser(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
  async updateUser(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
  async disableUser(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
  async enableUser(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
  async disconnectUser(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
  async disconnectAllSessions(): Promise<never> {
    throw new NotImplementedError(this.vendorName);
  }
}
