import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { resolveReference, initiateStkPushForCustomer, getMpesaConfigStatus } from "@mashupkgrid/payments";
import { successResponse, AppError, NotFoundError, ValidationError, ConflictError, isAppError } from "@mashupkgrid/shared";
import { checkMaintenance } from "../plugins/maintenance.js";

/**
 * Public checkout: "Pay your internet bill" for a payment reference (MH…), no login.
 *
 * What is exposed is deliberately minimal — the ISP's name, the customer's first name and initial,
 * the invoice number and amount due. Never a phone number, full name, address or balance history:
 * a reference is shared by SMS and can be forwarded. Status is only ever read back from what the
 * provider's callback recorded; the browser can't tell us a payment succeeded.
 */

const checkoutRateLimit = { max: 10, timeWindow: "1 minute" };
const lookupRateLimit = { max: 60, timeWindow: "1 minute" };
const referenceParams = z.object({ reference: z.string().trim().min(8).max(16) });

function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? "Customer";
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]![0]!.toUpperCase()}.` : "";
  return `${first}${last}`;
}

async function loadReference(raw: string) {
  const ref = await resolveReference(raw);
  // One answer for "no such reference" and "exists but not payable": a lookup must not reveal
  // which references exist for a suspended or deleted ISP.
  if (!ref || ref.tenant.deletedAt || ref.tenant.status !== "ACTIVE" || (ref.customer && ref.customer.deletedAt)) {
    throw new NotFoundError("Payment reference");
  }
  return ref;
}

async function amountDue(ref: Awaited<ReturnType<typeof loadReference>>) {
  if (ref.invoice) {
    const payable = ["PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(ref.invoice.status);
    return { payable, dueMinor: payable ? Math.max(0, ref.invoice.totalMinor - ref.invoice.amountPaidMinor) : 0 };
  }
  const open = await prisma.invoice.findMany({
    where: { tenantId: ref.tenantId, customerId: ref.customerId ?? undefined, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
    select: { totalMinor: true, amountPaidMinor: true },
  });
  return { payable: true, dueMinor: open.reduce((t, i) => t + (i.totalMinor - i.amountPaidMinor), 0) };
}

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/:reference",
    { config: { audience: "public", rateLimit: lookupRateLimit }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { reference } = referenceParams.parse(request.params);
      const ref = await loadReference(reference);
      const { payable, dueMinor } = await amountDue(ref);

      const service = ref.invoice?.customerServiceId
        ? await prisma.customerService.findUnique({
            where: { id: ref.invoice.customerServiceId },
            select: { package: { select: { name: true } } },
          })
        : ref.customerId
          ? await prisma.customerService.findFirst({
              where: { customerId: ref.customerId, tenantId: ref.tenantId },
              orderBy: { createdAt: "desc" },
              select: { package: { select: { name: true } } },
            })
          : null;

      // How to pay by paybill instead: the platform paybill with this reference, or the ISP's own
      // paybill with the account number its own C2B matching understands.
      let paybill: { number: string | null; account: string | null } = { number: null, account: null };
      if (ref.tenant.collectionMode === "PLATFORM") {
        const platform = await prisma.platformMpesaConfig.findFirst({ select: { shortcode: true } });
        paybill = { number: platform?.shortcode ?? null, account: ref.reference };
      } else {
        const own = await getMpesaConfigStatus(ref.tenantId).catch(() => null);
        paybill = {
          number: own?.configured ? own.shortcode : null,
          account: ref.invoice?.invoiceNumber ?? ref.customer?.customerNumber ?? null,
        };
      }

      reply.send(
        successResponse(
          {
            reference: ref.reference,
            purpose: ref.purpose,
            isp: ref.tenant.name,
            customer: ref.customer ? displayName(ref.customer.fullName) : null,
            invoice: ref.invoice
              ? { number: ref.invoice.invoiceNumber, status: ref.invoice.status, dueDate: ref.invoice.dueDate, currency: ref.invoice.currency }
              : null,
            packageName: service?.package.name ?? null,
            payable,
            amountDueMinor: dueMinor,
            // An invoice reference pays exactly what is due; an account reference may pay any amount.
            fixedAmount: Boolean(ref.invoice),
            collectedBy: ref.tenant.collectionMode === "PLATFORM" ? "MASHUPHOST" : "ISP",
            paybill,
          },
          request.id
        )
      );
    }
  );

  app.post(
    "/:reference/stk",
    { config: { audience: "public", rateLimit: checkoutRateLimit }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { reference } = referenceParams.parse(request.params);
      const body = z
        .object({
          phone: z.string().trim().min(9).max(20),
          amountMinor: z.number().int().min(100).max(15_000_000).optional(),
        })
        .parse(request.body);
      const ref = await loadReference(reference);
      if (!ref.customerId) throw new NotFoundError("Payment reference");
      const { payable, dueMinor } = await amountDue(ref);
      if (!payable) throw new ConflictError("This invoice has already been paid.");

      let amountMinor: number;
      if (ref.invoice) {
        amountMinor = dueMinor;
      } else {
        amountMinor = body.amountMinor ?? dueMinor;
      }
      // M-Pesa takes whole shillings; round up so the invoice is never left a few cents short.
      amountMinor = Math.ceil(amountMinor / 100) * 100;
      if (amountMinor < 100) throw new ValidationError("Enter an amount of at least KES 1.");

      let stk;
      try {
        stk = await initiateStkPushForCustomer(ref.tenantId, {
          customerId: ref.customerId,
          invoiceId: ref.invoiceId,
          phone: body.phone,
          amountMinor,
          initiatedByUserId: null,
        });
      } catch (err) {
        if (isAppError(err)) throw err;
        // Daraja unreachable or refusing: say so plainly. Nothing was charged — no prompt was sent.
        request.log.error({ err }, "Checkout STK push failed");
        throw new AppError("PAYMENT_PROVIDER_UNAVAILABLE", "M-Pesa isn't responding right now, so no payment prompt was sent. Please try again in a minute.", 503);
      }
      reply.status(201).send(
        successResponse({ checkoutRequestId: stk.checkoutRequestId, amountMinor, status: stk.status }, request.id)
      );
    }
  );

  app.get(
    "/:reference/status/:checkoutRequestId",
    { config: { audience: "public", rateLimit: lookupRateLimit }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { reference, checkoutRequestId } = z
        .object({ reference: z.string().trim().min(8).max(16), checkoutRequestId: z.string().min(5).max(80) })
        .parse(request.params);
      const ref = await loadReference(reference);
      // Scoped to this reference's customer: a checkout id alone reveals nothing about anyone else.
      const stk = await prisma.mpesaStkRequest.findFirst({
        where: { checkoutRequestId, tenantId: ref.tenantId, customerId: ref.customerId ?? undefined },
        select: { status: true, resultDesc: true, mpesaReceiptNumber: true, amountMinor: true },
      });
      if (!stk) throw new NotFoundError("Payment");
      reply.send(
        successResponse(
          {
            status: stk.status,
            message: stk.status === "PENDING" ? null : stk.resultDesc,
            receipt: stk.status === "COMPLETED" && !stk.mpesaReceiptNumber?.startsWith("PRV-") ? stk.mpesaReceiptNumber : null,
            amountMinor: stk.amountMinor,
          },
          request.id
        )
      );
    }
  );
}
