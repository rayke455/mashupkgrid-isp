import { prisma, type SmsProviderConfig } from "@mashupkgrid/database";
import { encryptAtRest, decryptAtRest, ValidationError, NotFoundError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";

export interface AfricasTalkingCredentials {
  apiKey: string;
  username: string;
  senderId: string | null;
  environment: "sandbox" | "production";
}

export interface SetSmsConfigInput {
  apiKey: string;
  username: string;
  senderId?: string | null;
  environment: "sandbox" | "production";
  isActive?: boolean;
}

export async function setSmsConfig(tenantId: string, input: SetSmsConfigInput): Promise<SmsProviderConfig> {
  const data = {
    apiKeyEncrypted: encryptAtRest(input.apiKey, env.ENCRYPTION_KEY),
    username: input.username,
    senderId: input.senderId ?? null,
    environment: input.environment,
    isActive: input.isActive ?? true,
  };
  return prisma.smsProviderConfig.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data },
  });
}

/** Never returns the decrypted API key to a caller that isn't about to call Africa's Talking —
 *  see `getSmsConfigStatus` for what's safe to show in the admin UI. */
export async function getSmsCredentials(tenantId: string): Promise<AfricasTalkingCredentials> {
  const config = await prisma.smsProviderConfig.findUnique({ where: { tenantId } });
  if (!config || !config.isActive) {
    throw new NotFoundError("SMS gateway configuration");
  }
  if (!config.apiKeyEncrypted || !config.username) {
    throw new ValidationError("SMS gateway configuration is incomplete");
  }
  return {
    apiKey: decryptAtRest(config.apiKeyEncrypted, env.ENCRYPTION_KEY),
    username: config.username,
    senderId: config.senderId,
    environment: config.environment === "production" ? "production" : "sandbox",
  };
}

export interface SmsConfigStatus {
  configured: boolean;
  isActive: boolean;
  username: string | null;
  senderId: string | null;
  environment: string;
}

/** Safe-to-display summary — never exposes the decrypted API key. */
export async function getSmsConfigStatus(tenantId: string): Promise<SmsConfigStatus> {
  const config = await prisma.smsProviderConfig.findUnique({ where: { tenantId } });
  if (!config) {
    return { configured: false, isActive: false, username: null, senderId: null, environment: "sandbox" };
  }
  return {
    configured: Boolean(config.apiKeyEncrypted && config.username),
    isActive: config.isActive,
    username: config.username,
    senderId: config.senderId,
    environment: config.environment,
  };
}
