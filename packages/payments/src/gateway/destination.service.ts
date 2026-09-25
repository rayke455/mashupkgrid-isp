import { prisma, type SettlementDestination } from "@mashupkgrid/database";
import { encryptAtRest, decryptAtRest, ValidationError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import { normalizeKenyanPhone } from "../mpesa/phone.js";
import { lockTenantForBalanceChange, maskPhone, type Db } from "./common.js";
import { providerForDestination, type DestinationDetails } from "./providers.js";

/**
 * Where a tenant's money goes. Exactly one destination is active per tenant (partial unique index);
 * changing it deactivates the old row rather than editing it, so every settlement keeps pointing
 * at the destination it was actually sent to.
 *
 * Per the product decision, a new destination is usable immediately. It starts UNVERIFIED and
 * becomes VERIFIED the first time a provider confirms a settlement to it — a fact, not a checkbox.
 */

export interface DestinationInput {
  type: SettlementDestination["type"];
  accountName: string;
  phone?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  tillNumber?: string;
  paybillNumber?: string;
  paybillAccountReference?: string;
}

/** What any API response may contain. Full phone and bank numbers never leave the server. */
export interface PresentedDestination {
  id: string;
  type: SettlementDestination["type"];
  accountName: string;
  /** e.g. "M-Pesa ****1234", "Equity Bank ****6789", "Till 123456". */
  label: string;
  phone: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountLast4: string | null;
  tillNumber: string | null;
  paybillNumber: string | null;
  paybillAccountReference: string | null;
  verificationStatus: SettlementDestination["verificationStatus"];
  verifiedAt: Date | null;
  isActive: boolean;
  /** AUTOMATIC when a provider can send to it, MANUAL when a person must. */
  settlementMethod: "AUTOMATIC" | "MANUAL";
  provider: string;
  createdAt: Date;
}

export function destinationLabel(d: Pick<SettlementDestination, "type" | "phone" | "bankName" | "bankAccountLast4" | "tillNumber" | "paybillNumber" | "paybillAccountReference">): string {
  switch (d.type) {
    case "MPESA_PHONE":
      return `M-Pesa ${maskPhone(d.phone) ?? ""}`.trim();
    case "BANK_ACCOUNT":
      return `${d.bankName ?? "Bank"} ${d.bankAccountLast4 ? `****${d.bankAccountLast4}` : ""}`.trim();
    case "TILL":
      return `Till ${d.tillNumber ?? ""}`.trim();
    case "PAYBILL":
      return `Paybill ${d.paybillNumber ?? ""}${d.paybillAccountReference ? ` · Acc ${d.paybillAccountReference}` : ""}`;
  }
}

export function presentDestination(d: SettlementDestination): PresentedDestination {
  const provider = providerForDestination(d.type);
  return {
    id: d.id,
    type: d.type,
    accountName: d.accountName,
    label: destinationLabel(d),
    phone: maskPhone(d.phone),
    bankName: d.bankName,
    bankBranch: d.bankBranch,
    bankAccountLast4: d.bankAccountLast4,
    tillNumber: d.tillNumber,
    paybillNumber: d.paybillNumber,
    paybillAccountReference: d.paybillAccountReference,
    verificationStatus: d.verificationStatus,
    verifiedAt: d.verifiedAt,
    isActive: d.isActive,
    settlementMethod: provider.automatic ? "AUTOMATIC" : "MANUAL",
    provider: provider.kind,
    createdAt: d.createdAt,
  };
}

/** A snapshot for the settlement row: enough to show where the money went, never a full number. */
export function destinationSnapshot(d: SettlementDestination): Record<string, string | null> {
  return {
    type: d.type,
    label: destinationLabel(d),
    accountName: d.accountName,
    phone: maskPhone(d.phone),
    bankName: d.bankName,
    bankAccountLast4: d.bankAccountLast4,
    tillNumber: d.tillNumber,
    paybillNumber: d.paybillNumber,
    paybillAccountReference: d.paybillAccountReference,
  };
}

/** Full details for the provider call. Decrypts the bank number in memory only. */
export function destinationDetails(d: SettlementDestination): DestinationDetails {
  return {
    type: d.type,
    accountName: d.accountName,
    phone: d.phone,
    bankName: d.bankName,
    bankBranch: d.bankBranch,
    bankAccountNumber: d.bankAccountNumberEncrypted ? decryptAtRest(d.bankAccountNumberEncrypted, env.ENCRYPTION_KEY) : null,
    tillNumber: d.tillNumber,
    paybillNumber: d.paybillNumber,
    paybillAccountReference: d.paybillAccountReference,
  };
}

function normalise(input: DestinationInput): DestinationDetails {
  const clean = (v?: string) => (v === undefined ? null : v.trim() || null);
  const base: DestinationDetails = {
    type: input.type,
    accountName: input.accountName.trim(),
    phone: null,
    bankName: null,
    bankBranch: null,
    bankAccountNumber: null,
    tillNumber: null,
    paybillNumber: null,
    paybillAccountReference: null,
  };
  switch (input.type) {
    case "MPESA_PHONE":
      return { ...base, phone: clean(input.phone) };
    case "BANK_ACCOUNT":
      return {
        ...base,
        bankName: clean(input.bankName),
        bankBranch: clean(input.bankBranch),
        bankAccountNumber: clean(input.bankAccountNumber)?.replace(/\s+/g, "") ?? null,
      };
    case "TILL":
      return { ...base, tillNumber: clean(input.tillNumber)?.replace(/\s+/g, "") ?? null };
    case "PAYBILL":
      return {
        ...base,
        paybillNumber: clean(input.paybillNumber)?.replace(/\s+/g, "") ?? null,
        paybillAccountReference: clean(input.paybillAccountReference),
      };
  }
}

export function validateDestinationInput(input: DestinationInput): DestinationDetails {
  const details = normalise(input);
  const problems = providerForDestination(details.type).validateDestination(details);
  if (problems.length > 0) throw new ValidationError(problems.join(" "));
  if (details.type === "MPESA_PHONE") details.phone = normalizeKenyanPhone(details.phone ?? "");
  return details;
}

export async function getActiveDestination(tenantId: string, db: Db = prisma): Promise<SettlementDestination | null> {
  return db.settlementDestination.findFirst({ where: { tenantId, isActive: true } });
}

export async function listDestinations(tenantId: string): Promise<SettlementDestination[]> {
  return prisma.settlementDestination.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Replaces the tenant's active destination. Returns both sides for the audit log. */
export async function setActiveDestination(
  tenantId: string,
  input: DestinationInput,
  userId: string
): Promise<{ before: SettlementDestination | null; after: SettlementDestination }> {
  const details = validateDestinationInput(input);

  return prisma.$transaction(async (tx) => {
    // Same lock a settlement takes: a destination can't change underneath a settlement being built.
    await lockTenantForBalanceChange(tx, tenantId);
    const before = await tx.settlementDestination.findFirst({ where: { tenantId, isActive: true } });
    if (before) {
      await tx.settlementDestination.update({
        where: { id: before.id },
        data: { isActive: false, deactivatedAt: new Date() },
      });
    }
    const after = await tx.settlementDestination.create({
      data: {
        tenantId,
        type: details.type,
        accountName: details.accountName,
        phone: details.phone ?? null,
        bankName: details.bankName ?? null,
        bankBranch: details.bankBranch ?? null,
        bankAccountNumberEncrypted: details.bankAccountNumber
          ? encryptAtRest(details.bankAccountNumber, env.ENCRYPTION_KEY)
          : null,
        bankAccountLast4: details.bankAccountNumber ? details.bankAccountNumber.slice(-4) : null,
        tillNumber: details.tillNumber ?? null,
        paybillNumber: details.paybillNumber ?? null,
        paybillAccountReference: details.paybillAccountReference ?? null,
        createdByUserId: userId,
      },
    });
    return { before, after };
  });
}

