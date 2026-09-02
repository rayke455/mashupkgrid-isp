import { prisma, type HotspotVoucher } from "@mashupkgrid/database";
import { NotFoundError, ValidationError, generateSecureToken } from "@mashupkgrid/shared";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easier to read off a printed voucher
const CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 5;

function randomVoucherCode(): string {
  const raw = generateSecureToken(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[raw.charCodeAt(i % raw.length) % CODE_ALPHABET.length];
  }
  return code;
}

export interface GenerateVouchersInput {
  tenantId: string;
  createdByUserId?: string | null;
  count: number;
  hotspotPackageId?: string | null;
  packageId?: string | null;
  durationMinutes?: number | null;
  dataCapMb?: number | null;
  downloadKbps?: number | null;
  uploadKbps?: number | null;
}

/** Generates `count` self-contained hotspot vouchers. Each voucher is its own RADIUS identity
 *  (username == password == the printed code — the standard "scratch card" hotspot pattern, see
 *  the HotspotVoucher model comment) rather than something tied to a CustomerService, since a
 *  voucher is bought anonymously at the hotspot with no prior account. */
export async function generateVouchers(input: GenerateVouchersInput): Promise<HotspotVoucher[]> {
  if (input.count < 1 || input.count > 500) {
    throw new ValidationError("count must be between 1 and 500");
  }

  let durationMinutes = input.durationMinutes;
  let dataCapMb = input.dataCapMb;
  let downloadKbps = input.downloadKbps;
  let uploadKbps = input.uploadKbps;

  if (input.hotspotPackageId) {
    const pkg = await prisma.hotspotPackage.findUnique({
      where: { id: input.hotspotPackageId },
    });
    // A package that doesn't exist, or belongs to a different tenant, must reject the whole
    // request rather than silently drop just the default-filling — falling through here used to
    // leave `hotspotPackageId` in the spread below, so the created voucher (and every voucher
    // list response, which includes the joined package) would carry another tenant's package
    // name/price/bandwidth settings via a foreign-key reference the caller never legitimately had.
    if (!pkg || pkg.tenantId !== input.tenantId) {
      throw new NotFoundError("Hotspot package");
    }
    durationMinutes = durationMinutes ?? pkg.durationMinutes;
    dataCapMb = dataCapMb ?? pkg.dataCapMb;
    downloadKbps = downloadKbps ?? pkg.downloadKbps;
    uploadKbps = uploadKbps ?? pkg.uploadKbps;
  }

  const resolvedInput: GenerateVouchersInput = {
    ...input,
    durationMinutes,
    dataCapMb,
    downloadKbps,
    uploadKbps,
  };

  const vouchers: HotspotVoucher[] = [];
  for (let i = 0; i < input.count; i++) {
    vouchers.push(await createOneVoucher(resolvedInput));
  }
  return vouchers;
}

export async function createHotspotVoucherForPurchase(
  tenantId: string,
  hotspotPackageId: string
): Promise<HotspotVoucher> {
  const pkg = await prisma.hotspotPackage.findUniqueOrThrow({
    where: { id: hotspotPackageId },
  });
  if (pkg.tenantId !== tenantId) {
    throw new NotFoundError("HotspotPackage");
  }

  return createOneVoucher({
    tenantId,
    hotspotPackageId: pkg.id,
    durationMinutes: pkg.durationMinutes,
    dataCapMb: pkg.dataCapMb,
    downloadKbps: pkg.downloadKbps,
    uploadKbps: pkg.uploadKbps,
    count: 1,
    createdByUserId: null,
  });
}

async function createOneVoucher(input: GenerateVouchersInput): Promise<HotspotVoucher> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = randomVoucherCode();
    const clash = await prisma.hotspotVoucher.findUnique({
      where: { tenantId_code: { tenantId: input.tenantId, code } },
    });
    if (clash) continue;

    return prisma.$transaction(async (tx) => {
      const voucher = await tx.hotspotVoucher.create({
        data: {
          tenantId: input.tenantId,
          code,
          hotspotPackageId: input.hotspotPackageId ?? null,
          packageId: input.packageId ?? null,
          durationMinutes: input.durationMinutes ?? null,
          dataCapMb: input.dataCapMb ?? null,
          downloadKbps: input.downloadKbps ?? null,
          uploadKbps: input.uploadKbps ?? null,
          createdByUserId: input.createdByUserId ?? null,
          status: "UNUSED",
        },
      });

      await tx.radCheck.create({
        data: { username: code, attribute: "Cleartext-Password", op: ":=", value: code },
      });
      if (input.durationMinutes) {
        await tx.radReply.create({
          data: {
            username: code,
            attribute: "Session-Timeout",
            op: "=",
            value: String(input.durationMinutes * 60),
          },
        });
      }
      if (input.dataCapMb) {
        await tx.radReply.create({
          data: {
            username: code,
            attribute: "Mikrotik-Total-Limit",
            op: "=",
            value: String(input.dataCapMb * 1024 * 1024),
          },
        });
      }
      if (input.downloadKbps && input.uploadKbps) {
        await tx.radReply.create({
          data: {
            username: code,
            attribute: "Mikrotik-Rate-Limit",
            op: "=",
            value: `${input.uploadKbps}k/${input.downloadKbps}k`,
          },
        });
      }

      return voucher;
    });
  }
  throw new ValidationError("Could not generate a unique voucher code, please retry");
}

/** Marks a voucher ACTIVE and stamps its expiry. Called from the hotspot login flow the moment
 *  a customer's device first authenticates with the code — a voucher's clock starts at first
 *  use, not at creation. */
/**
 * Checks a code is usable WITHOUT starting its clock.
 *
 * The captive portal calls this to tell a customer their code is good before handing them to the
 * router. Activating here — as this flow used to — starts the countdown at the moment of
 * validation rather than the moment of connection, so a customer whose hand-off then fails loses
 * paid time while never having been online at all. That is exactly what happens when anything
 * downstream breaks, and it turns one fault into a refund request.
 *
 * The clock now starts in the RADIUS Access-Request path instead: the router asking to
 * authenticate a code is the first moment anyone is actually being let onto the network.
 */
export async function validateVoucherForLogin(tenantId: string, code: string): Promise<HotspotVoucher> {
  const voucher = await prisma.hotspotVoucher.findUnique({ where: { tenantId_code: { tenantId, code } } });
  if (!voucher) throw new NotFoundError("Voucher");
  return voucher;
}

export async function activateVoucher(tenantId: string, code: string): Promise<HotspotVoucher> {
  const voucher = await prisma.hotspotVoucher.findUnique({ where: { tenantId_code: { tenantId, code } } });
  if (!voucher) throw new NotFoundError("Voucher");
  if (voucher.status !== "UNUSED") return voucher;

  const now = new Date();
  const expiresAt = voucher.durationMinutes ? new Date(now.getTime() + voucher.durationMinutes * 60_000) : null;

  return prisma.hotspotVoucher.update({
    where: { id: voucher.id },
    data: { status: "ACTIVE", activatedAt: now, expiresAt },
  });
}

/** Sweeps every ACTIVE voucher past its `expiresAt` to EXPIRED and revokes its RADIUS identity
 *  so it can no longer authenticate. Intended as a worker repeatable job, mirroring
 *  `retryPendingSyncTasks` in sync.service.ts. */
export async function expireOverdueVouchers(): Promise<{ processed: number }> {
  const overdue = await prisma.hotspotVoucher.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
    take: 500,
  });

  for (const voucher of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.hotspotVoucher.update({ where: { id: voucher.id }, data: { status: "EXPIRED" } });
      await tx.radCheck.deleteMany({ where: { username: voucher.code } });
      await tx.radReply.deleteMany({ where: { username: voucher.code } });
    });
  }

  return { processed: overdue.length };
}
