import { prisma, type AiAssistantConfig } from "@mashupkgrid/database";
import { encryptAtRest, decryptAtRest, ValidationError, NotFoundError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";

export interface SetAiAssistantConfigInput {
  apiKey: string;
  isActive?: boolean;
}

export async function setAiAssistantConfig(
  tenantId: string,
  input: SetAiAssistantConfigInput
): Promise<AiAssistantConfig> {
  const data = {
    apiKeyEncrypted: encryptAtRest(input.apiKey, env.ENCRYPTION_KEY),
    isActive: input.isActive ?? true,
  };
  return prisma.aiAssistantConfig.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data },
  });
}

/** Never returns the decrypted key to a caller that isn't about to call Anthropic — see
 *  `getAiAssistantConfigStatus` for what's safe to show in the admin UI. */
export async function getAiAssistantApiKey(tenantId: string): Promise<string> {
  const config = await prisma.aiAssistantConfig.findUnique({ where: { tenantId } });
  if (!config || !config.isActive) {
    throw new NotFoundError("AI assistant configuration");
  }
  if (!config.apiKeyEncrypted) {
    throw new ValidationError("AI assistant configuration is incomplete");
  }
  return decryptAtRest(config.apiKeyEncrypted, env.ENCRYPTION_KEY);
}

export interface AiAssistantConfigStatus {
  configured: boolean;
  isActive: boolean;
}

/** Safe-to-display summary — never exposes the decrypted API key. */
export async function getAiAssistantConfigStatus(tenantId: string): Promise<AiAssistantConfigStatus> {
  const config = await prisma.aiAssistantConfig.findUnique({ where: { tenantId } });
  if (!config) return { configured: false, isActive: false };
  return { configured: Boolean(config.apiKeyEncrypted), isActive: config.isActive };
}
