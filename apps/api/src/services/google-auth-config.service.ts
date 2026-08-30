import { prisma } from "@mashupkgrid/database";

/** Singleton row, same pattern as PlatformMpesaConfig — a fixed, well-known id rather than "just
 *  take the first row" so a second row could never silently sneak in. */
const SINGLETON_ID = "platform";

export interface GoogleAuthConfigStatus {
  enabled: boolean;
  clientId: string | null;
}

/** What the public login/register page checks before showing the button, and what the auth
 *  service itself uses to verify a credential's audience — same source, so they can never
 *  disagree about whether Google sign-in is actually on. */
export async function getPlatformGoogleAuthConfig(): Promise<GoogleAuthConfigStatus> {
  const config = await prisma.platformGoogleAuthConfig.findUnique({ where: { id: SINGLETON_ID } });
  const enabled = !!(config?.isActive && config.clientId);
  return { enabled, clientId: enabled ? config!.clientId : null };
}

export interface SetGoogleAuthConfigInput {
  clientId: string;
  isActive: boolean;
}

export async function setPlatformGoogleAuthConfig(input: SetGoogleAuthConfigInput) {
  return prisma.platformGoogleAuthConfig.upsert({
    where: { id: SINGLETON_ID },
    update: { clientId: input.clientId, isActive: input.isActive },
    create: { id: SINGLETON_ID, clientId: input.clientId, isActive: input.isActive },
  });
}
