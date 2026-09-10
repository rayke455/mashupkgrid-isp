import { prisma } from "@mashupkgrid/database";
import { encryptAtRest, decryptAtRest, ValidationError, NotFoundError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import type { MpesaCredentials } from "./config.service.js";

/** Singleton row — there is exactly one platform M-Pesa config, never per-tenant (see the
 *  PlatformMpesaConfig schema comment). A fixed, well-known id keeps the singleton pattern
 *  explicit rather than relying on "just take the first row" (which would silently tolerate a
 *  second row ever getting created by mistake). */
const SINGLETON_ID = "platform";

export interface SetPlatformMpesaConfigInput {
  consumerKey?: string;
  consumerSecret?: string;
  shortcode?: string;
  passkey?: string;
  environment?: "sandbox" | "production";
  isActive?: boolean;
  /** B2B initiator: the Daraja API user allowed to move money out, and their password already
   *  encrypted against Safaricom's public certificate. The operator generates that blob — this
   *  platform never handles the plain password. Optional so an operator can configure collection
   *  before they have B2B approval. */
  initiatorName?: string;
  initiatorCredential?: string;
  /** Smallest balance an automatic payout run will send, in cents. */
  payoutMinimumMinor?: number;
  /** --- Donate / "Buy Me a Coffee" M-Pesa gateway --- */
  donateEnabled?: boolean;
  donatePaybill?: string;
  donateAccountReference?: string;
}

export async function setPlatformMpesaConfig(input: SetPlatformMpesaConfigInput) {
  const existing = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });

  if (!existing && (!input.consumerKey || !input.consumerSecret || !input.shortcode || !input.passkey)) {
    throw new ValidationError(
      "Consumer key, secret, shortcode, and passkey are required for initial platform M-Pesa configuration"
    );
  }

  const updateData: Record<string, any> = {
    ...(input.consumerKey ? { consumerKeyEncrypted: encryptAtRest(input.consumerKey, env.ENCRYPTION_KEY) } : {}),
    ...(input.consumerSecret ? { consumerSecretEncrypted: encryptAtRest(input.consumerSecret, env.ENCRYPTION_KEY) } : {}),
    ...(input.shortcode ? { shortcode: input.shortcode } : {}),
    ...(input.passkey ? { passkeyEncrypted: encryptAtRest(input.passkey, env.ENCRYPTION_KEY) } : {}),
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.initiatorName !== undefined ? { initiatorName: input.initiatorName || null } : {}),
    ...(input.initiatorCredential
      ? { initiatorCredentialEncrypted: encryptAtRest(input.initiatorCredential, env.ENCRYPTION_KEY) }
      : {}),
    ...(input.payoutMinimumMinor !== undefined
      ? { payoutMinimumMinor: Math.max(1, Math.floor(input.payoutMinimumMinor)) }
      : {}),
    ...(input.donateEnabled !== undefined ? { donateEnabled: input.donateEnabled } : {}),
    ...(input.donatePaybill !== undefined ? { donatePaybill: input.donatePaybill.trim() || null } : {}),
    ...(input.donateAccountReference !== undefined
      ? { donateAccountReference: input.donateAccountReference.trim() || null }
      : {}),
  };

  return prisma.platformMpesaConfig.upsert({
    where: { id: SINGLETON_ID },
    update: updateData,
    create: {
      id: SINGLETON_ID,
      consumerKeyEncrypted: input.consumerKey ? encryptAtRest(input.consumerKey, env.ENCRYPTION_KEY) : "",
      consumerSecretEncrypted: input.consumerSecret ? encryptAtRest(input.consumerSecret, env.ENCRYPTION_KEY) : "",
      shortcode: input.shortcode ?? "",
      passkeyEncrypted: input.passkey ? encryptAtRest(input.passkey, env.ENCRYPTION_KEY) : "",
      environment: input.environment ?? "sandbox",
      isActive: input.isActive ?? true,
      ...updateData,
    },
  });
}

// ---------------------------------------------------------------------------
// Donate / "Buy Me a Coffee" config
// ---------------------------------------------------------------------------

export interface DonateConfig {
  enabled: boolean;
  paybill: string | null;
  accountReference: string;
}

/** Public-facing config the donate page reads to display the correct Paybill and account
 *  reference. Falls back to the platform's own shortcode when no dedicated donate paybill is
 *  set, and to "COFFEE" when no account reference is set. */
export async function getDonateConfig(): Promise<DonateConfig> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  return {
    enabled: config?.donateEnabled ?? false,
    paybill: config?.donatePaybill || config?.shortcode || null,
    accountReference: config?.donateAccountReference || "COFFEE",
  };
}

/** Safe-to-display: whether payouts are possible at all, never the credential itself. */
export async function getPlatformB2BStatus(): Promise<{
  configured: boolean;
  initiatorName: string | null;
  payoutMinimumMinor: number;
}> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  return {
    configured: Boolean(config?.initiatorName && config.initiatorCredentialEncrypted),
    initiatorName: config?.initiatorName ?? null,
    payoutMinimumMinor: config?.payoutMinimumMinor ?? 1,
  };
}

/** The configured floor, for the payout run. Falls back to 1 cent — remit everything — when the
 *  platform has never been configured, which is the safe direction: a tenant is paid rather than
 *  quietly accumulating a balance nobody set a threshold for. */
export async function getPayoutMinimumMinor(): Promise<number> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  return config?.payoutMinimumMinor ?? 1;
}

export async function getPlatformMpesaCredentials(): Promise<MpesaCredentials> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!config || !config.isActive) {
    throw new NotFoundError("Platform M-Pesa configuration");
  }
  if (!config.consumerKeyEncrypted || !config.consumerSecretEncrypted || !config.shortcode || !config.passkeyEncrypted) {
    throw new ValidationError("Platform M-Pesa configuration is incomplete");
  }
  return {
    consumerKey: decryptAtRest(config.consumerKeyEncrypted, env.ENCRYPTION_KEY),
    consumerSecret: decryptAtRest(config.consumerSecretEncrypted, env.ENCRYPTION_KEY),
    shortcode: config.shortcode,
    // The platform's own collection account is a Paybill. This is stated explicitly rather than
    // defaulted so that adding Till support for tenants can never silently change how the
    // platform's own SaaS fees are collected.
    shortcodeType: "PAYBILL",
    storeNumber: null,
    passkey: decryptAtRest(config.passkeyEncrypted, env.ENCRYPTION_KEY),
    environment: config.environment === "production" ? "production" : "sandbox",
  };
}

export interface PlatformMpesaConfigStatus {
  configured: boolean;
  isActive: boolean;
  shortcode: string | null;
  environment: string;
  donateEnabled: boolean;
  donatePaybill: string | null;
  donateAccountReference: string | null;
}

export async function getPlatformMpesaConfigStatus(): Promise<PlatformMpesaConfigStatus> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!config) return { configured: false, isActive: false, shortcode: null, environment: "sandbox", donateEnabled: false, donatePaybill: null, donateAccountReference: null };
  return {
    configured: Boolean(config.consumerKeyEncrypted && config.consumerSecretEncrypted && config.passkeyEncrypted),
    isActive: config.isActive,
    shortcode: config.shortcode,
    environment: config.environment,
    donateEnabled: config.donateEnabled,
    donatePaybill: config.donatePaybill,
    donateAccountReference: config.donateAccountReference,
  };
}
