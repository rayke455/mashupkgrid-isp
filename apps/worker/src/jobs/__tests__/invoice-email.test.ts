import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prisma: { invoice: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
  sendEmail: vi.fn().mockResolvedValue({ delivered: true }),
}));
vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/email.js", () => ({ sendEmail: h.sendEmail }));

import { buildInvoiceEmail, emailInvoice, handleSendPendingInvoiceEmails } from "../invoice-email.js";

const invoice = {
  id: "inv1",
  tenantId: "t1",
  invoiceNumber: "INV-000123",
  currency: "KES",
  totalMinor: 150000,
  amountPaidMinor: 0,
  dueDate: new Date("2026-10-05T00:00:00Z"),
  items: [{ description: "Home 10 Mbps — renewal", quantity: 1, totalMinor: 150000 }],
  customer: { fullName: "Jane <Wanjiku>", email: "jane@example.com", customerNumber: "C-0007" },
  tenant: { name: "Acme Fibre", currency: "KES" },
};

describe("invoice email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.invoice.findUnique.mockResolvedValue(invoice);
  });

  it("puts the amount due, due date and the reference to quote in the email", () => {
    const mail = buildInvoiceEmail(invoice as never);
    expect(mail.subject).toContain("INV-000123");
    expect(mail.subject).toContain("KES 1,500.00");
    expect(mail.text).toContain("Amount due: KES 1,500.00");
    expect(mail.text).toContain("C-0007");
    expect(mail.html).toContain("Jane &lt;Wanjiku&gt;"); // escaped
  });

  it("says paid when nothing is owed", () => {
    const mail = buildInvoiceEmail({ ...invoice, amountPaidMinor: 150000 } as never);
    expect(mail.subject).toMatch(/paid$/);
    expect(mail.text).toContain("fully paid");
  });

  it("sends, stamps emailedAt, and refuses another tenant's invoice", async () => {
    expect(await emailInvoice("inv1", "t1")).toBeNull();
    expect(h.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
    expect(h.prisma.invoice.update).toHaveBeenCalledWith({ where: { id: "inv1" }, data: { emailedAt: expect.any(Date) } });
    expect(await emailInvoice("inv1", "other-tenant")).toBe("no-such-invoice");
  });

  it("counts customers without an email instead of retrying them forever", async () => {
    h.prisma.invoice.findMany.mockResolvedValue([
      { id: "inv1", customer: { email: "jane@example.com" } },
      { id: "inv2", customer: { email: null } },
    ]);
    expect(await handleSendPendingInvoiceEmails()).toEqual({ sent: 1, noEmail: 1 });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const where = h.prisma.invoice.findMany.mock.calls[0]![0].where;
    expect(where.emailedAt).toBeNull();
  });
});
