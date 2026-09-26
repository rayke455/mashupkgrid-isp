import type { FastifyRequest } from "fastify";
import { prisma, type Customer } from "@mashupkgrid/database";
import { ConflictError, ForbiddenError, NotFoundError } from "@mashupkgrid/shared";

/**
 * The signed-in customer's own account, resolved from their user id, never a client-supplied
 * id. That scoping is what makes every /me route safe for the CUSTOMER role. A login is either
 * the account holder (Customer.userId) or a member the holder invited (CustomerMember.userId).
 */

export interface MyAccount {
  customer: Customer;
  role: "holder" | "member";
  canPay: boolean;
  /** Who is signed in: the holder's name, or the member's. */
  name: string;
}

export async function resolveMyAccountOrThrow(request: FastifyRequest): Promise<MyAccount> {
  const tenantId = request.user!.tenantId;
  if (tenantId === null) throw new ConflictError("Platform accounts have no customer record");

  const own = await prisma.customer.findFirst({ where: { tenantId, userId: request.user!.id, deletedAt: null } });
  if (own) return { customer: own, role: "holder", canPay: true, name: own.fullName };

  const membership = await prisma.customerMember.findFirst({
    where: { tenantId, userId: request.user!.id, customer: { deletedAt: null } },
    include: { customer: true },
  });
  if (membership) return { customer: membership.customer, role: "member", canPay: membership.canPay, name: membership.name };

  // NotFoundError appends " was not found"; the "contact support" guidance lives in the web app.
  throw new NotFoundError("A linked customer record");
}

export async function resolveMyCustomerOrThrow(request: FastifyRequest): Promise<Customer> {
  return (await resolveMyAccountOrThrow(request)).customer;
}

/** For paying: the holder, or a member the holder allowed to pay. */
export async function resolvePayingCustomerOrThrow(request: FastifyRequest): Promise<Customer> {
  const account = await resolveMyAccountOrThrow(request);
  if (!account.canPay) throw new ForbiddenError("Only the account holder can pay on this account. Ask them to allow you to pay.");
  return account.customer;
}

/** For changes to the account itself: pausing, the router password, managing members. */
export async function resolveAccountHolderOrThrow(request: FastifyRequest): Promise<Customer> {
  const account = await resolveMyAccountOrThrow(request);
  if (account.role !== "holder") throw new ForbiddenError("Only the account holder can do this");
  return account.customer;
}
