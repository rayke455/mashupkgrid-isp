import { randomUUID } from "node:crypto";
import type { SettlementDestinationType, SettlementProviderKind } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { initiateB2BPayment, initiateB2CPayment } from "../mpesa/daraja-client.js";
import {
  getPlatformB2BInitiator,
  getPlatformB2CCredentials,
  getPlatformMpesaCredentials,
} from "../mpesa/platform-config.service.js";
import { normalizeKenyanPhone } from "../mpesa/phone.js";

/**
 * How a settlement physically reaches a tenant. Each destination type can need a different
 * provider API — B2C for a phone, B2B for a till or paybill, and (today) a person for a bank
 * transfer — so the settlement service only ever talks to this interface.
 *
 * The contract that matters most is what `initiateSettlement` promises about money:
 *  - it RESOLVES with ACCEPTED when the provider took the instruction (money may still fail later —
 *    the provider's asynchronous result decides, never this return value);
 *  - it RESOLVES with MANUAL when a human has to make the transfer;
 *  - it THROWS SettlementRejectedError only when the provider definitively refused, so nothing moved
 *    and the reserved balance can safely be given back;
 *  - it THROWS SettlementOutcomeUnknownError when the request may or may not have reached the
 *    provider (network failure mid-call). The balance then stays reserved and the settlement is held
 *    for review — releasing it could pay the tenant twice.
 */

export interface DestinationDetails {
  type: SettlementDestinationType;
  accountName: string;
  phone?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  /** Decrypted; only ever held in memory for the duration of the call. */
  bankAccountNumber?: string | null;
  tillNumber?: string | null;
  paybillNumber?: string | null;
  paybillAccountReference?: string | null;
}

export interface SettlementInstruction {
  settlementId: string;
  settlementNumber: string;
  amountMinor: number;
  currency: string;
  tenantName: string;
  tenantSlug: string;
  destination: DestinationDetails;
}

export type InitiateResult =
  | { kind: "ACCEPTED"; conversationId: string | null; originatorConversationId: string }
  | { kind: "MANUAL" };

export type ProviderStatus = "PROCESSING" | "SETTLED" | "FAILED" | "UNKNOWN";

export interface SettlementProvider {
  readonly kind: SettlementProviderKind;
  /** True when the provider moves money itself; false when a person must (MANUAL). */
  readonly automatic: boolean;
  supports(type: SettlementDestinationType): boolean;
  /** Returns human-readable problems; an empty list means the destination is usable. */
  validateDestination(destination: DestinationDetails): string[];
  initiateSettlement(instruction: SettlementInstruction): Promise<InitiateResult>;
  /** For M-Pesa the outcome is pushed to our result URL; this reports what is recorded. */
  getSettlementStatus(recordedStatus: string): Promise<ProviderStatus>;
  /** M-Pesa has no API to pull back a completed B2B/B2C transfer. */
  reverseSettlement(settlementId: string): Promise<never>;
}

export class SettlementRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementRejectedError";
  }
}

export class SettlementOutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementOutcomeUnknownError";
  }
}

export class SettlementNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementNotSupportedError";
  }
}

// ---------------------------------------------------------------------------------------------
// Validation shared by every provider — a destination is either well-formed or it is not.
// ---------------------------------------------------------------------------------------------

export function validateDestinationShape(d: DestinationDetails): string[] {
  const problems: string[] = [];
  if (!d.accountName || d.accountName.trim().length < 2) problems.push("Account name is required.");
  switch (d.type) {
    case "MPESA_PHONE":
      try {
        normalizeKenyanPhone(d.phone ?? "");
      } catch {
        problems.push("Enter a valid Kenyan M-Pesa number, e.g. 0712 345 678.");
      }
      break;
    case "TILL":
      if (!/^\d{5,8}$/.test(d.tillNumber ?? "")) problems.push("A till number is 5–8 digits.");
      break;
    case "PAYBILL":
      if (!/^\d{5,7}$/.test(d.paybillNumber ?? "")) problems.push("A paybill number is 5–7 digits.");
      if (d.paybillAccountReference && !/^[A-Za-z0-9 _-]{1,20}$/.test(d.paybillAccountReference)) {
        problems.push("The paybill account number can be up to 20 letters, digits, spaces, dashes or underscores.");
      }
      break;
    case "BANK_ACCOUNT":
      if (!d.bankName || d.bankName.trim().length < 2) problems.push("Bank name is required.");
      if (!/^[A-Za-z0-9-]{6,24}$/.test(d.bankAccountNumber ?? "")) {
        problems.push("A bank account number is 6–24 letters or digits.");
      }
      break;
  }
  return problems;
}

function resultUrls(): { resultUrl: string; queueTimeoutUrl: string } {
  const base = `${env.APP_API_PUBLIC_URL}/api/v1/payments/mpesa/payout`;
  const token = env.MPESA_CALLBACK_TOKEN ? `?token=${encodeURIComponent(env.MPESA_CALLBACK_TOKEN)}` : "";
  return { resultUrl: `${base}/result${token}`, queueTimeoutUrl: `${base}/timeout${token}` };
}

/**
 * Sort a Daraja failure into "Safaricom said no" versus "we don't know". The Daraja client throws
 * `M-Pesa B2x payment failed: …` only after reading Safaricom's own response, and the OAuth call
 * happens before any money instruction is sent — both are definite. Anything else (DNS, reset
 * connection, timeout) may have happened after Safaricom received the request.
 */
function classifyDarajaError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/^M-Pesa B2[BC] payment failed:/.test(message) || /^M-Pesa OAuth request failed/.test(message)) {
    throw new SettlementRejectedError(message);
  }
  if (err instanceof Error && /not configured|incomplete|Platform M-Pesa configuration/i.test(message)) {
    throw new SettlementRejectedError(message);
  }
  throw new SettlementOutcomeUnknownError(
    `No definite answer from M-Pesa (${message}). The transfer may or may not have been made — confirm with Safaricom before resolving.`
  );
}

async function neverReversible(): Promise<never> {
  throw new SettlementNotSupportedError(
    "M-Pesa cannot pull back a completed transfer. Recover the funds from the tenant and record an adjustment."
  );
}

async function recordedStatus(status: string): Promise<ProviderStatus> {
  if (status === "SETTLED") return "SETTLED";
  if (status === "FAILED" || status === "CANCELLED") return "FAILED";
  if (status === "PROCESSING") return "PROCESSING";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------------------------

export const mpesaB2BProvider: SettlementProvider = {
  kind: "MPESA_B2B",
  automatic: true,
  supports: (type) => type === "TILL" || type === "PAYBILL",
  validateDestination: validateDestinationShape,
  async initiateSettlement(instruction) {
    const d = instruction.destination;
    const destinationShortcode = d.type === "TILL" ? d.tillNumber : d.paybillNumber;
    if (!destinationShortcode) throw new SettlementRejectedError("Destination has no till or paybill number.");
    let response;
    try {
      const [credentials, initiator] = await Promise.all([getPlatformMpesaCredentials(), getPlatformB2BInitiator()]);
      response = await initiateB2BPayment({
        credentials,
        initiatorName: initiator.initiatorName,
        securityCredential: initiator.securityCredential,
        destinationShortcode,
        destinationType: d.type === "TILL" ? "TILL" : "PAYBILL",
        amountMinor: instruction.amountMinor,
        accountReference: d.paybillAccountReference || instruction.tenantSlug,
        remarks: `Settlement ${instruction.settlementNumber}`,
        ...resultUrls(),
      });
    } catch (err) {
      classifyDarajaError(err);
    }
    return {
      kind: "ACCEPTED",
      conversationId: response.ConversationID ?? null,
      originatorConversationId: response.OriginatorConversationID,
    };
  },
  getSettlementStatus: recordedStatus,
  reverseSettlement: neverReversible,
};

export const mpesaB2CProvider: SettlementProvider = {
  kind: "MPESA_B2C",
  automatic: true,
  supports: (type) => type === "MPESA_PHONE",
  validateDestination: validateDestinationShape,
  async initiateSettlement(instruction) {
    const phone = normalizeKenyanPhone(instruction.destination.phone ?? "");
    // B2C v1 (the endpoint Safaricom provisions for production apps): Safaricom issues the
    // OriginatorConversationID in its acknowledgement and echoes it on the result callback; our own
    // id is only a fallback for an acknowledgement that omits it.
    const originatorConversationId = `STL-${instruction.settlementId}`;
    let response;
    try {
      const b2c = await getPlatformB2CCredentials();
      response = await initiateB2CPayment({
        credentials: b2c.credentials,
        initiatorName: b2c.initiatorName,
        securityCredential: b2c.securityCredential,
        originatorConversationId,
        phone,
        amountMinor: instruction.amountMinor,
        remarks: `Settlement ${instruction.settlementNumber}`,
        occasion: instruction.tenantName,
        ...resultUrls(),
      });
    } catch (err) {
      classifyDarajaError(err);
    }
    return {
      kind: "ACCEPTED",
      conversationId: response.ConversationID ?? null,
      originatorConversationId: response.OriginatorConversationID || originatorConversationId,
    };
  },
  getSettlementStatus: recordedStatus,
  reverseSettlement: neverReversible,
};

/** Bank transfers: no bank API is integrated, so a super admin makes the transfer and records
 *  its reference. Nothing is ever marked settled without that reference. */
export const manualProvider: SettlementProvider = {
  kind: "MANUAL",
  automatic: false,
  supports: () => true,
  validateDestination: validateDestinationShape,
  async initiateSettlement() {
    return { kind: "MANUAL" };
  },
  getSettlementStatus: recordedStatus,
  async reverseSettlement() {
    throw new SettlementNotSupportedError("Reverse a manual transfer with the bank, then record an adjustment.");
  },
};

/**
 * Development only. Accepts the instruction without contacting any provider; the result is then
 * supplied by a super admin through the "simulate result" action, exactly as a Daraja callback
 * would. Every settlement it touches is stamped SANDBOX, and it is impossible to enable in
 * production (see sandboxSettlementsEnabled).
 */
export const sandboxProvider: SettlementProvider = {
  kind: "SANDBOX",
  automatic: true,
  supports: (type) => type !== "BANK_ACCOUNT",
  validateDestination: validateDestinationShape,
  async initiateSettlement() {
    return { kind: "ACCEPTED", conversationId: null, originatorConversationId: `SBX-${randomUUID()}` };
  },
  getSettlementStatus: recordedStatus,
  reverseSettlement: neverReversible,
};

export function sandboxSettlementsEnabled(): boolean {
  return process.env["NODE_ENV"] !== "production" && process.env["PAYMENTS_SANDBOX_SETTLEMENTS"] === "true";
}

/** The provider for a destination. Bank accounts are always MANUAL until a bank API exists. */
export function providerForDestination(type: SettlementDestinationType): SettlementProvider {
  if (type === "BANK_ACCOUNT") return manualProvider;
  if (sandboxSettlementsEnabled()) return sandboxProvider;
  return type === "MPESA_PHONE" ? mpesaB2CProvider : mpesaB2BProvider;
}

export function providerByKind(kind: SettlementProviderKind): SettlementProvider {
  switch (kind) {
    case "MPESA_B2B":
      return mpesaB2BProvider;
    case "MPESA_B2C":
      return mpesaB2CProvider;
    case "SANDBOX":
      return sandboxProvider;
    case "MANUAL":
      return manualProvider;
  }
}
