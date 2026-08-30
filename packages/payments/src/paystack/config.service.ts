import { prisma, type PaymentProviderConfig } from "@mashupkgrid/database";
import { encryptAtRest, decryptAtRest, ValidationError, NotFoundError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";

export interface PaystackCredentials {
  secretKey: string;
  publicKey: string | null;
}

export interface SetPaystackConfigInput {
  secretKey: string;
  publicKey?: string | null;
  isActive?: boolean;
}

export async function setPaystackConfig(
  tenantId: string,
  input: SetPaystackConfigInput
): Promise<PaymentProviderConfig> {
  const data = {
    secretKeyEncrypted: encryptAtRest(input.secretKey, env.ENCRYPTION_KEY),
    publicKey: input.publicKey ?? null,
    isActive: input.isActive ?? true,
  };
  return prisma.paymentProviderConfig.upsert({
    where: { tenantId_provider: { tenantId, provider: "PAYSTACK" } },
    update: data,
    create: { tenantId, provider: "PAYSTACK", ...data },
  });
}

/** Never returns the decrypted secret to a caller that isn't about to call Paystack — see
 *  `getPaystackConfigStatus` for what's safe to show in the admin UI. */
export async function getPaystackCredentials(tenantId: string): Promise<PaystackCredentials> {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: "PAYSTACK" } },
  });
  if (!config || !config.isActive) {
    throw new NotFoundError("Paystack configuration");
  }
  if (!config.secretKeyEncrypted) {
    throw new ValidationError("Paystack configuration is incomplete");
  }
  return {
    secretKey: decryptAtRest(config.secretKeyEncrypted, env.ENCRYPTION_KEY),
    publicKey: config.publicKey,
  };
}

export interface PaystackConfigStatus {
  configured: boolean;
  isActive: boolean;
  publicKey: string | null;
}

/** Safe-to-display summary — never exposes the decrypted secret key. */
export async function getPaystackConfigStatus(tenantId: string): Promise<PaystackConfigStatus> {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: "PAYSTACK" } },
  });
  if (!config) return { configured: false, isActive: false, publicKey: null };
  return {
    configured: Boolean(config.secretKeyEncrypted),
    isActive: config.isActive,
    publicKey: config.publicKey,
  };
}
