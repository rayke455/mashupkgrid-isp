import { prisma, type PaymentProviderConfig } from "@mashupkgrid/database";
import { encryptAtRest, decryptAtRest, ValidationError, NotFoundError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";

export interface PesapalCredentials {
  consumerKey: string;
  consumerSecret: string;
  ipnId: string | null;
  environment: "live" | "sandbox";
}

export interface SetPesapalConfigInput {
  consumerKey: string;
  consumerSecret: string;
  ipnId?: string | null;
  environment?: "live" | "sandbox";
  isActive?: boolean;
}

export async function setPesapalConfig(
  tenantId: string,
  input: SetPesapalConfigInput
): Promise<PaymentProviderConfig> {
  const data = {
    publicKey: input.consumerKey.trim(),
    secretKeyEncrypted: encryptAtRest(input.consumerSecret.trim(), env.ENCRYPTION_KEY),
    isActive: input.isActive ?? true,
  };

  return prisma.paymentProviderConfig.upsert({
    where: { tenantId_provider: { tenantId, provider: "PESAPAL" as any } },
    update: data,
    create: { tenantId, provider: "PESAPAL" as any, ...data },
  });
}

/** Returns credentials for API calls. Never returns decrypted secret to client UI. */
export async function getPesapalCredentials(tenantId: string): Promise<PesapalCredentials> {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: "PESAPAL" as any } },
  });
  if (!config || !config.isActive) {
    throw new NotFoundError("Pesapal configuration");
  }
  if (!config.publicKey || !config.secretKeyEncrypted) {
    throw new ValidationError("Pesapal configuration is incomplete (Consumer Key & Secret required)");
  }

  const isLive = !config.publicKey.toLowerCase().startsWith("test") && !config.publicKey.toLowerCase().includes("sandbox");

  return {
    consumerKey: config.publicKey,
    consumerSecret: decryptAtRest(config.secretKeyEncrypted, env.ENCRYPTION_KEY),
    ipnId: null,
    environment: isLive ? "live" : "sandbox",
  };
}

export interface PesapalConfigStatus {
  configured: boolean;
  isActive: boolean;
  consumerKey: string | null;
  environment: "live" | "sandbox";
}

/** Safe-to-display summary for UI — never exposes consumer secret. */
export async function getPesapalConfigStatus(tenantId: string): Promise<PesapalConfigStatus> {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: "PESAPAL" as any } },
  });

  if (!config) {
    return { configured: false, isActive: false, consumerKey: null, environment: "sandbox" };
  }

  const isLive = Boolean(
    config.publicKey &&
      !config.publicKey.toLowerCase().startsWith("test") &&
      !config.publicKey.toLowerCase().includes("sandbox")
  );

  return {
    configured: Boolean(config.publicKey && config.secretKeyEncrypted),
    isActive: config.isActive,
    consumerKey: config.publicKey,
    environment: isLive ? "live" : "sandbox",
  };
}
