import { prisma, type RadiusUser } from "@mashupkgrid/database";
import { UnauthorizedError, timingSafeStringEqual } from "@mashupkgrid/shared";
import { getDecryptedRadiusPassword } from "./radius-user.service.js";

/** Every input shape a customer might type their own number in as — kept intentionally small
 *  and local (not a shared phone utility) since Customer.phone itself is stored as whatever the
 *  customer typed at registration/onboarding, not normalized to one canonical format. Matching
 *  several candidate forms is simpler and more robust than trying to retroactively normalize
 *  years of existing free-text phone data. */
function phoneVariants(input: string): string[] {
  const digits = input.replace(/[^\d]/g, "");
  const variants = new Set<string>([input.trim()]);

  if (/^0(7|1)\d{8}$/.test(digits)) {
    variants.add(digits);
    variants.add(`254${digits.slice(1)}`);
    variants.add(`+254${digits.slice(1)}`);
  } else if (/^254(7|1)\d{8}$/.test(digits)) {
    variants.add(digits);
    variants.add(`+${digits}`);
    variants.add(`0${digits.slice(3)}`);
  } else if (/^(7|1)\d{8}$/.test(digits)) {
    variants.add(digits);
    variants.add(`254${digits}`);
    variants.add(`+254${digits}`);
    variants.add(`0${digits}`);
  }

  return [...variants];
}

/**
 * Lets an existing subscriber log into a hotspot with their regular PPPoE/RADIUS account
 * credentials instead of buying a voucher — the same account, no separate "hotspot plan"
 * product needed. Deliberately throws the same generic UnauthorizedError whether the phone
 * number doesn't match any customer or the password is wrong, so a captive-portal brute-forcer
 * can't use the response to enumerate which phone numbers are real subscribers.
 *
 * `Customer.phone` has no uniqueness constraint — two records can genuinely share a number (a
 * duplicate entry, a family sharing a line). Picking just the first match and failing if *that
 * one* has no matching password would incorrectly reject a real customer whenever an unrelated
 * record happens to collide on phone — this tries the password against every customer the phone
 * matches, not just the first one findFirst happens to return.
 */
export async function authenticateHotspotAccount(
  tenantId: string,
  phone: string,
  password: string
): Promise<RadiusUser> {
  const customers = await prisma.customer.findMany({
    where: { tenantId, phone: { in: phoneVariants(phone) }, deletedAt: null },
  });

  for (const customer of customers) {
    const radiusUser = await prisma.radiusUser.findFirst({
      where: { tenantId, customerId: customer.id, status: "ACTIVE" },
    });
    if (!radiusUser) continue;

    const actualPassword = await getDecryptedRadiusPassword(radiusUser);
    if (timingSafeStringEqual(actualPassword, password)) {
      return radiusUser;
    }
  }

  throw new UnauthorizedError("Invalid phone number or password");
}
