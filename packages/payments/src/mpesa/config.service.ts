import { prisma, type PaymentProviderConfig } from "@mashupkgrid/database";
import { encryptAtRest, decryptAtRest, ValidationError, NotFoundError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";

/** "PAYBILL" pays a paybill number; "TILL" pays a Buy Goods till. See darajaBusinessShortCode
 *  in daraja-client.ts for why the distinction changes more than just a label. */
export type MpesaShortcodeType = "PAYBILL" | "TILL";

export interface MpesaCredentials {
  consumerKey: string;
  consumerSecret: string;
  /** The number the customer's money actually goes to — paybill or till. */
  shortcode: string;
  shortcodeType: MpesaShortcodeType;
  /** Head office / store number. Only meaningful for TILL. */
  storeNumber: string | null;
  passkey: string;
  environment: "sandbox" | "production";
}

export interface SetMpesaConfigInput {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  shortcodeType?: MpesaShortcodeType;
  storeNumber?: string | null;
  passkey: string;
  environment: "sandbox" | "production";
  isActive?: boolean;
}

export async function setMpesaConfig(
  tenantId: string,
  input: SetMpesaConfigInput
): Promise<PaymentProviderConfig> {
  return prisma.paymentProviderConfig.upsert({
    where: { tenantId_provider: { tenantId, provider: "MPESA" } },
    update: {
      consumerKeyEncrypted: encryptAtRest(input.consumerKey, env.ENCRYPTION_KEY),
      consumerSecretEncrypted: encryptAtRest(input.consumerSecret, env.ENCRYPTION_KEY),
      shortcode: input.shortcode,
      shortcodeType: input.shortcodeType ?? "PAYBILL",
      storeNumber: input.storeNumber?.trim() || null,
      passkeyEncrypted: encryptAtRest(input.passkey, env.ENCRYPTION_KEY),
      environment: input.environment,
      isActive: input.isActive ?? true,
    },
    create: {
      tenantId,
      provider: "MPESA",
      consumerKeyEncrypted: encryptAtRest(input.consumerKey, env.ENCRYPTION_KEY),
      consumerSecretEncrypted: encryptAtRest(input.consumerSecret, env.ENCRYPTION_KEY),
      shortcode: input.shortcode,
      shortcodeType: input.shortcodeType ?? "PAYBILL",
      storeNumber: input.storeNumber?.trim() || null,
      passkeyEncrypted: encryptAtRest(input.passkey, env.ENCRYPTION_KEY),
      environment: input.environment,
      isActive: input.isActive ?? true,
    },
  });
}

/** Never returns the decrypted secrets to a caller that isn't about to call the Daraja API —
 *  see `getMpesaConfigStatus` for what's safe to show in the admin UI. */
export async function getMpesaCredentials(tenantId: string): Promise<MpesaCredentials> {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: "MPESA" } },
  });
  if (!config || !config.isActive) {
    throw new NotFoundError("M-Pesa configuration");
  }
  if (
    !config.consumerKeyEncrypted ||
    !config.consumerSecretEncrypted ||
    !config.shortcode ||
    !config.passkeyEncrypted
  ) {
    throw new ValidationError("M-Pesa configuration is incomplete");
  }
  return {
    consumerKey: decryptAtRest(config.consumerKeyEncrypted, env.ENCRYPTION_KEY),
    consumerSecret: decryptAtRest(config.consumerSecretEncrypted, env.ENCRYPTION_KEY),
    shortcode: config.shortcode,
    shortcodeType: config.shortcodeType === "TILL" ? "TILL" : "PAYBILL",
    storeNumber: config.storeNumber,
    passkey: decryptAtRest(config.passkeyEncrypted, env.ENCRYPTION_KEY),
    environment: config.environment === "production" ? "production" : "sandbox",
  };
}

export interface MpesaConfigStatus {
  configured: boolean;
  isActive: boolean;
  shortcode: string | null;
  shortcodeType: MpesaShortcodeType;
  storeNumber: string | null;
  environment: string;
}

/** Safe-to-display summary — never exposes the decrypted secrets. */
export async function getMpesaConfigStatus(tenantId: string): Promise<MpesaConfigStatus> {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: "MPESA" } },
  });
  if (!config)
    return {
      configured: false,
      isActive: false,
      shortcode: null,
      shortcodeType: "PAYBILL",
      storeNumber: null,
      environment: "sandbox",
    };
  return {
    configured: Boolean(config.consumerKeyEncrypted && config.consumerSecretEncrypted && config.passkeyEncrypted),
    isActive: config.isActive,
    shortcode: config.shortcode,
    shortcodeType: config.shortcodeType === "TILL" ? "TILL" : "PAYBILL",
    storeNumber: config.storeNumber,
    environment: config.environment,
  };
}
