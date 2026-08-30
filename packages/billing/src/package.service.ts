import { prisma, type Package, type BillingCycle } from "@mashupkgrid/database";
import { NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { cycleLengthDays } from "./money.js";

export interface CreatePackageInput {
  name: string;
  description?: string | null;
  downloadKbps: number;
  uploadKbps: number;
  burstDownloadKbps?: number | null;
  burstUploadKbps?: number | null;
  dataCapMb?: number | null;
  billingCycle: BillingCycle;
  durationDays?: number | null;
  priceMinor: number;
  currency?: string;
  installationFeeMinor?: number;
  activationFeeMinor?: number;
  taxPercent?: number | null;
}

export async function createPackage(tenantId: string, input: CreatePackageInput): Promise<Package> {
  if (input.priceMinor < 0) throw new ValidationError("priceMinor cannot be negative");
  // Validates the CUSTOM/durationDays pairing up front rather than failing later at invoice time.
  cycleLengthDays(input.billingCycle, input.durationDays ?? null);

  return prisma.package.create({
    data: {
      tenantId,
      name: input.name,
      description: input.description ?? null,
      downloadKbps: input.downloadKbps,
      uploadKbps: input.uploadKbps,
      burstDownloadKbps: input.burstDownloadKbps ?? null,
      burstUploadKbps: input.burstUploadKbps ?? null,
      dataCapMb: input.dataCapMb ?? null,
      billingCycle: input.billingCycle,
      durationDays: input.durationDays ?? null,
      priceMinor: input.priceMinor,
      currency: input.currency ?? "KES",
      installationFeeMinor: input.installationFeeMinor ?? 0,
      activationFeeMinor: input.activationFeeMinor ?? 0,
      taxPercent: input.taxPercent ?? null,
    },
  });
}

export async function getPackageOrThrow(tenantId: string, packageId: string): Promise<Package> {
  const pkg = await prisma.package.findFirst({ where: { id: packageId, tenantId, deletedAt: null } });
  if (!pkg) throw new NotFoundError("Package");
  return pkg;
}

export type UpdatePackageInput = Partial<Omit<CreatePackageInput, "billingCycle" | "durationDays">>;

export async function updatePackage(
  tenantId: string,
  packageId: string,
  input: UpdatePackageInput
): Promise<Package> {
  await getPackageOrThrow(tenantId, packageId);
  return prisma.package.update({ where: { id: packageId }, data: input });
}

export async function setPackageActive(tenantId: string, packageId: string, isActive: boolean): Promise<Package> {
  await getPackageOrThrow(tenantId, packageId);
  return prisma.package.update({ where: { id: packageId }, data: { isActive } });
}
