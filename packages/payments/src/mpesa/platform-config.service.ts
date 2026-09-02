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
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  environment: "sandbox" | "production";
  isActive?: boolean;
  /** B2B initiator: the Daraja API user allowed to move money out, and their password already
   *  encrypted against Safaricom's public certificate. The operator generates that blob — this
   *  platform never handles the plain password. Optional so an operator can configure collection
   *  before they have B2B approval. */
  initiatorName?: string;
  initiatorCredential?: string;
}

export async function setPlatformMpesaConfig(input: SetPlatformMpesaConfigInput) {
  const data = {
    consumerKeyEncrypted: encryptAtRest(input.consumerKey, env.ENCRYPTION_KEY),
    consumerSecretEncrypted: encryptAtRest(input.consumerSecret, env.ENCRYPTION_KEY),
    shortcode: input.shortcode,
    passkeyEncrypted: encryptAtRest(input.passkey, env.ENCRYPTION_KEY),
    environment: input.environment,
    isActive: input.isActive ?? true,
    // Only overwritten when supplied: re-saving collection settings must not silently wipe
    // payout credentials that were entered separately.
    ...(input.initiatorName !== undefined ? { initiatorName: input.initiatorName || null } : {}),
    ...(input.initiatorCredential
      ? { initiatorCredentialEncrypted: encryptAtRest(input.initiatorCredential, env.ENCRYPTION_KEY) }
      : {}),
  };
  return prisma.platformMpesaConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
}

/** Safe-to-display: whether payouts are possible at all, never the credential itself. */
export async function getPlatformB2BStatus(): Promise<{ configured: boolean; initiatorName: string | null }> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  return {
    configured: Boolean(config?.initiatorName && config.initiatorCredentialEncrypted),
    initiatorName: config?.initiatorName ?? null,
  };
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
}

export async function getPlatformMpesaConfigStatus(): Promise<PlatformMpesaConfigStatus> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!config) return { configured: false, isActive: false, shortcode: null, environment: "sandbox" };
  return {
    configured: Boolean(config.consumerKeyEncrypted && config.consumerSecretEncrypted && config.passkeyEncrypted),
    isActive: config.isActive,
    shortcode: config.shortcode,
    environment: config.environment,
  };
}
