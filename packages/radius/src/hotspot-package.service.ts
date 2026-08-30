import { prisma, type HotspotPackage } from "@mashupkgrid/database";
import { NotFoundError, ValidationError } from "@mashupkgrid/shared";

export interface CreateHotspotPackageInput {
  name: string;
  description?: string | null;
  priceMinor: number;
  currency?: string;
  durationMinutes: number;
  dataCapMb?: number | null;
  downloadKbps?: number | null;
  uploadKbps?: number | null;
  isPopular?: boolean;
  badge?: string | null;
}

export interface UpdateHotspotPackageInput {
  name?: string;
  description?: string | null;
  priceMinor?: number;
  currency?: string;
  durationMinutes?: number;
  dataCapMb?: number | null;
  downloadKbps?: number | null;
  uploadKbps?: number | null;
  isPopular?: boolean;
  badge?: string | null;
  isActive?: boolean;
}

export async function listHotspotPackages(
  tenantId: string,
  onlyActive = false
): Promise<HotspotPackage[]> {
  return prisma.hotspotPackage.findMany({
    where: {
      tenantId,
      ...(onlyActive ? { isActive: true } : {}),
    },
    orderBy: [{ priceMinor: "asc" }, { durationMinutes: "asc" }],
  });
}

export async function getHotspotPackageOrThrow(
  tenantId: string,
  id: string
): Promise<HotspotPackage> {
  const pkg = await prisma.hotspotPackage.findUnique({
    where: { id },
  });
  if (!pkg || pkg.tenantId !== tenantId) {
    throw new NotFoundError("HotspotPackage");
  }
  return pkg;
}

export async function createHotspotPackage(
  tenantId: string,
  input: CreateHotspotPackageInput
): Promise<HotspotPackage> {
  if (input.durationMinutes <= 0) {
    throw new ValidationError("durationMinutes must be greater than 0");
  }
  if (input.priceMinor < 0) {
    throw new ValidationError("priceMinor cannot be negative");
  }

  return prisma.hotspotPackage.create({
    data: {
      tenantId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      priceMinor: input.priceMinor,
      currency: input.currency ?? "KES",
      durationMinutes: input.durationMinutes,
      dataCapMb: input.dataCapMb ?? null,
      downloadKbps: input.downloadKbps ?? null,
      uploadKbps: input.uploadKbps ?? null,
      isPopular: input.isPopular ?? false,
      badge: input.badge?.trim() ?? null,
      isActive: true,
    },
  });
}

export async function updateHotspotPackage(
  tenantId: string,
  id: string,
  input: UpdateHotspotPackageInput
): Promise<HotspotPackage> {
  await getHotspotPackageOrThrow(tenantId, id);

  return prisma.hotspotPackage.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
      ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.dataCapMb !== undefined ? { dataCapMb: input.dataCapMb } : {}),
      ...(input.downloadKbps !== undefined ? { downloadKbps: input.downloadKbps } : {}),
      ...(input.uploadKbps !== undefined ? { uploadKbps: input.uploadKbps } : {}),
      ...(input.isPopular !== undefined ? { isPopular: input.isPopular } : {}),
      ...(input.badge !== undefined ? { badge: input.badge?.trim() ?? null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteHotspotPackage(
  tenantId: string,
  id: string
): Promise<void> {
  await getHotspotPackageOrThrow(tenantId, id);
  // Soft delete by deactivating so existing vouchers keep integrity
  await prisma.hotspotPackage.update({
    where: { id },
    data: { isActive: false },
  });
}
