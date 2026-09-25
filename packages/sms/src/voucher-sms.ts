import { prisma } from "@mashupkgrid/database";
import { sendTenantSms, type SendTenantSmsResult } from "./sms.service.js";

export interface VoucherSmsDetails {
  code: string;
  packageName: string;
}

/** One SMS page (160 characters): names are clipped so the code itself is never cut off. */
export function voucherSmsMessage(brand: string, details: VoucherSmsDetails): string {
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
  return (
    `${clip(brand, 28)} Wi-Fi: your code is ${details.code} for ${clip(details.packageName, 28)}. ` +
    `Lost connection? Join the Wi-Fi, open any page and enter this code.`
  );
}

/**
 * Texts a hotspot buyer their voucher code, so a phone that drops off the Wi-Fi before the portal
 * logs it in can still get online. Uses the tenant's own SMS gateway and credit, and does nothing
 * when the tenant has no active gateway or has switched voucher texts off.
 */
export async function sendHotspotVoucherSms(tenantId: string, phone: string, details: VoucherSmsDetails): Promise<SendTenantSmsResult> {
  const config = await prisma.smsProviderConfig.findUnique({
    where: { tenantId },
    select: { isActive: true, sendVoucherSms: true, tenant: { select: { name: true } } },
  });
  if (!config?.isActive) return { delivered: false, reason: "SMS gateway is not configured for this tenant" };
  if (!config.sendVoucherSms) return { delivered: false, reason: "Voucher texts are switched off" };
  return sendTenantSms(tenantId, phone, voucherSmsMessage(config.tenant.name, details));
}
