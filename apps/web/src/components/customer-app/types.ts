export type AppTab = "home" | "services" | "payments" | "support" | "profile";

export interface CustomerProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  customerNumber: string;
  accountNumber: string;
  photoUrl: string;
  address: string;
  outstandingBalance: number;
  currency: string;
  dueDate: string;
  referralCode: string;
  referralStats: {
    totalReferrals: number;
    successfulReferrals: number;
    pendingReferrals: number;
    totalEarnedKes: number;
  };
  internetService: {
    id: string;
    packageName: string;
    speedMbps: number;
    status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
    expiresAt: string;
    daysRemaining: number;
    priceKes: number;
    dataUsedGb: number;
    dataCapGb: number | null;
  };
  tvService: {
    id: string;
    packageName: string;
    channelsCount: number;
    status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
    expiresAt: string;
    daysRemaining: number;
    priceKes: number;
  };
}

export interface InternetPackage {
  id: string;
  name: string;
  tier: string;
  speedMbps: number;
  priceKes: number;
  priceUsd: number;
  features: string[];
  badge: string | null;
  isPopular?: boolean;
}

export interface TvPackage {
  id: string;
  name: string;
  tier: string;
  priceKes: number;
  priceUsd: number;
  channelsCount: number;
  channelsList: string[];
  features: string[];
  badge?: string;
}

export interface TransactionItem {
  id: string;
  date: string;
  amount: number;
  service: string;
  method: string;
  reference: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
  messages: Array<{
    sender: "customer" | "support";
    text: string;
    time: string;
  }>;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  ip: string;
  mac: string;
  isBlocked: boolean;
  type: "phone" | "laptop" | "tv" | "gaming" | "tablet" | "iot";
}
