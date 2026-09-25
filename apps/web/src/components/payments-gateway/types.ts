/** Shapes returned by /api/v1/tenant-payments and /api/v1/platform/payments. */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DailyPoint {
  day: string;
  grossMinor: number;
  feeMinor: number;
  count: number;
}

export interface TenantBalance {
  collectedMinor: number;
  feesMinor: number;
  refundsMinor: number;
  settledMinor: number;
  pendingSettlementMinor: number;
  availableMinor: number;
  settleableMinor: number;
}

export interface Destination {
  id: string;
  type: "MPESA_PHONE" | "BANK_ACCOUNT" | "TILL" | "PAYBILL";
  accountName: string;
  label: string;
  phone: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountLast4: string | null;
  tillNumber: string | null;
  paybillNumber: string | null;
  paybillAccountReference: string | null;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "FAILED";
  verifiedAt: string | null;
  isActive: boolean;
  settlementMethod: "AUTOMATIC" | "MANUAL";
  provider: string;
  createdAt: string;
}

export interface GatewayTransaction {
  id: string;
  txnNumber: string;
  tenantId: string;
  tenant?: { id: string; name: string; slug: string };
  customer: { id: string; fullName: string; customerNumber: string; phone?: string | null } | null;
  invoice: { id: string; invoiceNumber: string; status?: string } | null;
  paymentReference: { reference: string; purpose?: string } | null;
  settlement: { id: string; settlementNumber: string; status: string; completedAt?: string | null } | null;
  channel: "MPESA_STK" | "MPESA_C2B";
  providerReference: string;
  payerPhone: string | null;
  environment: "SANDBOX" | "PRODUCTION";
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  feePercentBps: number;
  feeFixedMinor: number;
  refundedMinor: number;
  status: "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "REVERSED";
  settlementStatus: "UNSETTLED" | "SETTLEMENT_PENDING" | "SETTLED";
  description: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  entryType: string;
  direction: "CREDIT" | "DEBIT";
  amountMinor: number;
  description: string;
  createdAt: string;
}

export interface Refund {
  id: string;
  refundNumber: string;
  kind: "REFUND" | "REVERSAL";
  amountMinor: number;
  feeReturnedMinor: number;
  reason: string;
  status: "PENDING_CUSTOMER_PAYOUT" | "COMPLETED";
  externalReference: string | null;
  createdAt: string;
}

export interface GatewayTransactionDetail extends GatewayTransaction {
  payment: { id: string; method: string; status: string; reference: string | null; reversedAt: string | null; reversalReason: string | null };
  ledgerEntries: LedgerEntry[];
  refunds: Refund[];
}

export type SettlementStatus = "REQUESTED" | "AWAITING_APPROVAL" | "PROCESSING" | "SETTLED" | "FAILED" | "CANCELLED";

export interface Settlement {
  id: string;
  settlementNumber: string;
  tenantId: string;
  tenant?: { id: string; name: string; slug: string };
  amountMinor: number;
  destinationType: string;
  destinationSnapshot: { label?: string; accountName?: string } | null;
  provider: "MPESA_B2B" | "MPESA_B2C" | "MANUAL" | "SANDBOX";
  environment: "SANDBOX" | "PRODUCTION";
  trigger: "AUTOMATIC" | "TENANT_REQUEST" | "ADMIN";
  status: SettlementStatus;
  transactionId: string | null;
  failureReason: string | null;
  resultDesc: string | null;
  notes: string | null;
  timedOutAt: string | null;
  originatorConversationId: string | null;
  createdAt: string;
  approvedAt: string | null;
  processingStartedAt: string | null;
  providerConfirmedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  retry?: { id: string; settlementNumber: string; status?: string } | null;
  retryOf?: { id: string; settlementNumber: string } | null;
}

export interface SettlementDetail extends Settlement {
  ledgerEntries: LedgerEntry[];
  gatewayTransactions: { id: string; txnNumber: string; grossMinor: number; feeMinor: number; netMinor: number; createdAt: string; status: string }[];
}

export interface TenantOverview {
  gateway: { connected: boolean; enabledByPlatform: boolean; environment: "SANDBOX" | "PRODUCTION"; paybill: string | null };
  balance: TenantBalance;
  todayCollectionsMinor: number;
  monthCollectionsMinor: number;
  monthFeesMinor: number;
  feeRule: { percentBps: number; fixedMinor: number };
  settlement: { mode: "AUTOMATIC" | "MANUAL"; frequency: "INSTANT" | "DAILY" | "WEEKLY" | "MANUAL"; minimumMinor: number; hourEat: number; weekday: number };
  destination: Destination | null;
  series: DailyPoint[];
}

export interface PlatformOverview {
  todayCollectionsMinor: number;
  todayCount: number;
  monthCollectionsMinor: number;
  pendingSettlementsMinor: number;
  pendingSettlementsCount: number;
  awaitingApprovalCount: number;
  settledMinor30d: number;
  platformRevenueMinor30d: number;
  failedPayments30d: number;
  refundsMinor30d: number;
  totalOwedMinor: number;
  environment: "SANDBOX" | "PRODUCTION";
  gatewayEnabled: boolean;
  series: DailyPoint[];
}

export interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  collectionMode: "OWN" | "PLATFORM";
  feePercentBpsOverride: number | null;
  feeFixedMinorOverride: number | null;
  balance: TenantBalance;
  destination: Destination | null;
}

export interface SettlementSettings {
  gatewayEnabled: boolean;
  feePercentBps: number;
  feeFixedMinor: number;
  settlementMode: "AUTOMATIC" | "MANUAL";
  settlementFrequency: "INSTANT" | "DAILY" | "WEEKLY" | "MANUAL";
  settlementMinimumMinor: number;
  settlementHourEat: number;
  settlementWeekday: number;
  updatedAt: string;
}

export const FREQUENCY_LABEL: Record<SettlementSettings["settlementFrequency"], string> = {
  INSTANT: "Instant",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MANUAL: "On request",
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function describeSchedule(s: { frequency: SettlementSettings["settlementFrequency"]; hourEat: number; weekday: number }): string {
  const hour = `${String(s.hourEat).padStart(2, "0")}:00 EAT`;
  switch (s.frequency) {
    case "INSTANT":
      return "Within minutes of each payment";
    case "DAILY":
      return `Every day at ${hour}`;
    case "WEEKLY":
      return `Every ${WEEKDAYS[s.weekday - 1]} at ${hour}`;
    case "MANUAL":
      return "Only when requested";
  }
}
