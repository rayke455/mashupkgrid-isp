import type { RouterVendor } from "@mashupkgrid/database";
import { decryptAtRest } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import type { NetworkDeviceAdapter } from "./adapter.interface.js";
import { MikroTikAdapter } from "./mikrotik/mikrotik.adapter.js";
import { StubAdapter } from "./stub.adapter.js";

export interface RouterCredentialRecord {
  vendor: RouterVendor;
  host: string;
  apiPort: number;
  useTls: boolean;
  usernameEncrypted: string;
  passwordEncrypted: string;
}

/** Builds the right adapter for a Router row, decrypting credentials in-process — the
 *  decrypted values never leave this call (docs/architecture/06). */
export function createAdapterForRouter(router: RouterCredentialRecord): NetworkDeviceAdapter {
  switch (router.vendor) {
    case "MIKROTIK":
      return new MikroTikAdapter({
        host: router.host,
        port: router.apiPort,
        useTls: router.useTls,
        username: decryptAtRest(router.usernameEncrypted, env.ENCRYPTION_KEY),
        password: decryptAtRest(router.passwordEncrypted, env.ENCRYPTION_KEY),
      });
    default:
      return new StubAdapter(router.vendor);
  }
}
