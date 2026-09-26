import { prisma } from "@mashupkgrid/database";
import { sendTenantSms } from "@mashupkgrid/sms";
import { sendCustomerMessageJobSchema } from "@mashupkgrid/shared";
import { sendEmail } from "../lib/email.js";

/**
 * A message staff wrote to one customer: "your installation is booked for Tuesday", "we are
 * upgrading the tower tonight". Email carries the subject and body; SMS gets the body only,
 * signed with the ISP's name, since a subject line on a text is just wasted characters.
 *
 * Each channel is attempted on its own — an unconfigured mail server must not stop the SMS —
 * and the outcome is recorded in the audit log so staff can see what was actually delivered.
 */
export async function handleSendCustomerMessage(payload: unknown): Promise<void> {
  const data = sendCustomerMessageJobSchema.parse(payload);
  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, tenantId: data.tenantId },
    select: { fullName: true, email: true, phone: true, tenant: { select: { name: true } } },
  });
  if (!customer) throw new Error(`Customer ${data.customerId} not found in tenant ${data.tenantId}`);

  const outcome: Record<string, string> = {};

  if (data.channels.includes("EMAIL")) {
    if (!customer.email) outcome.email = "no address on file";
    else {
      try {
        const result = await sendEmail({
          to: customer.email,
          subject: data.subject,
          text: `Hi ${customer.fullName},\n\n${data.body}\n\n${customer.tenant.name}`,
          html: `<p>Hi ${escapeHtml(customer.fullName)},</p><p style="white-space:pre-line">${escapeHtml(data.body)}</p><p>${escapeHtml(customer.tenant.name)}</p>`,
        });
        outcome.email = result.delivered ? "delivered" : "not delivered (mail transport not configured)";
      } catch (err) {
        outcome.email = `failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  if (data.channels.includes("SMS")) {
    try {
      const result = await sendTenantSms(data.tenantId, customer.phone, `${data.body}\n- ${customer.tenant.name}`);
      outcome.sms = result.delivered ? "delivered" : `not delivered${"reason" in result && result.reason ? ` (${result.reason})` : ""}`;
    } catch (err) {
      outcome.sms = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  await prisma.auditLog.create({
    data: {
      tenantId: data.tenantId,
      actorUserId: data.sentByUserId,
      action: "customer.message_sent",
      resourceType: "Customer",
      resourceId: data.customerId,
      after: { subject: data.subject, channels: data.channels, outcome },
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
