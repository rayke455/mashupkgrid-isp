import { prisma, type Customer, type CustomerStatus } from "@mashupkgrid/database";
import { ConflictError, NotFoundError } from "@mashupkgrid/shared";
import { withRetryOnNumberCollision } from "./sequence.js";

export interface CreateCustomerInput {
  fullName: string;
  email?: string | null;
  phone: string;
  idNumber?: string | null;
  address?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  connectionType?: string | null;
  userId?: string | null;
}

async function generateCustomerNumber(tenantId: string, attempt: number): Promise<string> {
  const count = await prisma.customer.count({ where: { tenantId } });
  const next = count + 1 + attempt;
  return `CUS-${String(next).padStart(6, "0")}`;
}

export async function createCustomer(tenantId: string, input: CreateCustomerInput): Promise<Customer> {
  return withRetryOnNumberCollision(
    (attempt) => generateCustomerNumber(tenantId, attempt),
    (customerNumber) =>
      prisma.customer.create({
        data: {
          tenantId,
          customerNumber,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone,
          idNumber: input.idNumber ?? null,
          address: input.address ?? null,
          gpsLat: input.gpsLat ?? null,
          gpsLng: input.gpsLng ?? null,
          connectionType: input.connectionType ?? null,
          userId: input.userId ?? null,
          status: "PENDING",
          wallet: { create: { balanceMinor: 0 } },
        },
      })
  );
}

export interface UpdateCustomerInput {
  fullName?: string;
  email?: string | null;
  phone?: string;
  idNumber?: string | null;
  address?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  connectionType?: string | null;
  notes?: string | null;
}

export async function getCustomerOrThrow(tenantId: string, customerId: string): Promise<Customer> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null } });
  if (!customer) throw new NotFoundError("Customer");
  return customer;
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  input: UpdateCustomerInput
): Promise<Customer> {
  await getCustomerOrThrow(tenantId, customerId);
  return prisma.customer.update({ where: { id: customerId }, data: input });
}

/**
 * Status transitions go through this single function so every change is a deliberate,
 * validated action rather than an arbitrary field update — e.g. INSTALLATION requires the
 * customer to have gone through the installation flow first is a rule a future phase can add
 * here without touching every call site.
 */
export async function changeCustomerStatus(
  tenantId: string,
  customerId: string,
  status: CustomerStatus
): Promise<Customer> {
  await getCustomerOrThrow(tenantId, customerId);
  return prisma.customer.update({ where: { id: customerId }, data: { status } });
}

/**
 * Links this billing record to a login account so the customer can see their own
 * bills/subscription/wallet — self-registration creates a `User` with no `Customer` row at all
 * (there's no name/address/etc. to build one from at that point), so staff do this by hand once
 * they know which login belongs to which subscriber, the same way installation itself is a
 * manual step. `Customer.userId` is unique, so this also guards against double-linking either
 * side.
 */
export async function linkCustomerToUserAccount(
  tenantId: string,
  customerId: string,
  userEmail: string
): Promise<Customer> {
  const customer = await getCustomerOrThrow(tenantId, customerId);
  if (customer.userId) {
    throw new ConflictError("This customer already has a linked login account");
  }

  const user = await prisma.user.findFirst({
    where: { tenantId, email: userEmail.trim().toLowerCase() },
  });
  if (!user) throw new NotFoundError("A user with this email in this tenant");

  const alreadyLinked = await prisma.customer.findFirst({ where: { tenantId, userId: user.id } });
  if (alreadyLinked) {
    throw new ConflictError("This login account is already linked to a different customer");
  }

  return prisma.customer.update({ where: { id: customerId }, data: { userId: user.id } });
}
