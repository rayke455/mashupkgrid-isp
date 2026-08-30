import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, NotFoundError } from "@mashupkgrid/shared";
import { checkMaintenance } from "../plugins/maintenance.js";

const tenantParamsSchema = z.object({
  tenantSlug: z.string().min(1),
});

interface CustomerSessionData {
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

// In-memory / mockable persistent customer store for self-service portal
const DEFAULT_CUSTOMER_DATA: CustomerSessionData = {
  id: "cust-demo-macharia",
  fullName: "Macharia",
  phone: "+254 724 165 988",
  email: "macharia@gmail.com",
  customerNumber: "CUST-10452",
  accountNumber: "ACC-88921",
  photoUrl: "/cartoons/yellow-boy.jpg",
  address: "Kilimani Heights, Block B, Apt 402, Nairobi",
  outstandingBalance: 45.0,
  currency: "KES",
  dueDate: "15 Sept 2026",
  referralCode: "MACHARIA25",
  referralStats: {
    totalReferrals: 12,
    successfulReferrals: 8,
    pendingReferrals: 4,
    totalEarnedKes: 800,
  },
  internetService: {
    id: "srv-net-01",
    packageName: "Fiber 50Mbps",
    speedMbps: 50,
    status: "ACTIVE",
    expiresAt: "12 Sept 2026",
    daysRemaining: 12,
    priceKes: 2000,
    dataUsedGb: 84.5,
    dataCapGb: null, // Unlimited
  },
  tvService: {
    id: "srv-tv-01",
    packageName: "Premium Package",
    channelsCount: 100,
    status: "ACTIVE",
    expiresAt: "12 Sept 2026",
    daysRemaining: 12,
    priceKes: 1000,
  },
};

const DEFAULT_INTERNET_PACKAGES = [
  {
    id: "pkg-10mbps",
    name: "10 Mbps",
    tier: "Starter",
    speedMbps: 10,
    priceKes: 1000,
    priceUsd: 29,
    features: ["Basic Browsing", "SD Streaming", "Unlimited Data"],
    badge: null,
    isPopular: false,
  },
  {
    id: "pkg-20mbps",
    name: "20 Mbps",
    tier: "Essential",
    speedMbps: 20,
    priceKes: 1500,
    priceUsd: 49,
    features: ["HD Streaming", "Multiple Devices", "Low Latency"],
    badge: null,
    isPopular: false,
  },
  {
    id: "pkg-50mbps",
    name: "50 Mbps",
    tier: "Advanced",
    speedMbps: 50,
    priceKes: 2000,
    priceUsd: 79,
    features: ["4K Streaming", "Online Gaming", "Smart Home Ready", "Zero Throttling"],
    badge: "CURRENT PLAN",
    isPopular: true,
  },
  {
    id: "pkg-100mbps",
    name: "100 Mbps",
    tier: "Ultra",
    speedMbps: 100,
    priceKes: 3000,
    priceUsd: 119,
    features: ["8K Streaming", "Pro Gaming & WFH", "Priority Support", "Dedicated IP Ready"],
    badge: "TURBO SPEED",
    isPopular: false,
  },
];

const DEFAULT_TV_PACKAGES = [
  {
    id: "tv-basic",
    name: "TV BASIC",
    tier: "Basic",
    priceKes: 500,
    priceUsd: 15,
    channelsCount: 50,
    channelsList: ["Citizen TV", "KTN Home", "NTV", "K24", "SuperSport Blitz", "Al Jazeera", "BBC News", "Cartoon Network", "NatGeo Wild", "E! Entertainment"],
    features: ["50+ HD Channels", "Local & News", "Mobile & Smart TV App"],
  },
  {
    id: "tv-premium",
    name: "TV PREMIUM",
    tier: "Premium",
    priceKes: 1000,
    priceUsd: 30,
    channelsCount: 100,
    channelsList: ["SuperSport Premier League", "SuperSport LaLiga", "WWE Channel", "M-Net Movies 1 & 2", "Discovery Channel", "Nickelodeon", "Disney Channel", "CNN", "Sky News", "MTV Base"],
    features: ["100+ Channels", "Premier League & Sports", "4K Ultra HD", "3 Devices Concurrently"],
    badge: "CURRENT PLAN",
  },
  {
    id: "tv-premium-plus",
    name: "TV PREMIUM PLUS",
    tier: "Ultra",
    priceKes: 1500,
    priceUsd: 45,
    channelsCount: 150,
    channelsList: ["All SuperSport Channels", "Champions League", "F1 Channel", "M-Net Movies 1-4", "HBO Max Hits", "History Channel", "National Geographic", "Boomerang", "Food Network", "BeIN Sports"],
    features: ["150+ Channels", "Full Sports & Cinema Pack", "5 Concurrent Devices", "Cloud DVR Recording"],
  },
];

const DEFAULT_DEVICES = [
  { id: "dev-01", name: "Samsung Galaxy S24", ip: "192.168.88.45", mac: "DC:A6:32:89:11:AB", isBlocked: false, type: "phone" },
  { id: "dev-02", name: "iPhone 15 Pro Max", ip: "192.168.88.78", mac: "F4:D4:88:99:32:CC", isBlocked: false, type: "phone" },
  { id: "dev-03", name: "MacBook Pro M3", ip: "192.168.88.102", mac: "3C:22:FB:44:91:02", isBlocked: false, type: "laptop" },
  { id: "dev-04", name: "LG 4K OLED Smart TV", ip: "192.168.88.15", mac: "00:E0:4C:68:01:FE", isBlocked: false, type: "tv" },
  { id: "dev-05", name: "PlayStation 5 Console", ip: "192.168.88.90", mac: "70:9E:29:EE:41:88", isBlocked: false, type: "gaming" },
];

const DEFAULT_TICKETS = [
  {
    id: "FC-99234",
    subject: "Intermittent Connection",
    category: "Connection problem",
    status: "OPEN",
    createdAt: "Oct 24, 2026",
    messages: [
      { sender: "customer", text: "My Wi-Fi drops every evening around 8 PM.", time: "10:15 AM" },
      { sender: "support", text: "We have dispatched a line technician to check the fiber junction box.", time: "10:45 AM" },
    ],
  },
  {
    id: "FC-88120",
    subject: "Router Upgrade Request",
    category: "Equipment",
    status: "RESOLVED",
    createdAt: "Oct 10, 2026",
    messages: [
      { sender: "customer", text: "Requested Dual-Band Wi-Fi 6 router replacement.", time: "2:00 PM" },
      { sender: "support", text: "Gigabit ONT router successfully installed and tested.", time: "4:30 PM" },
    ],
  },
];

const DEFAULT_TRANSACTIONS = [
  {
    id: "TX-99812",
    date: "28 Aug 2026, 09:14 AM",
    amount: 2000,
    service: "Fiber 50Mbps Renewal",
    method: "M-PESA (STK Push)",
    reference: "QGH1234567",
    status: "SUCCESS",
  },
  {
    id: "TX-99450",
    date: "28 Jul 2026, 11:30 AM",
    amount: 2000,
    service: "Fiber 50Mbps Renewal",
    method: "M-PESA",
    reference: "QFF8819201",
    status: "SUCCESS",
  },
  {
    id: "TX-98711",
    date: "28 Jun 2026, 08:22 AM",
    amount: 1000,
    service: "TV Premium Subscription",
    method: "Pesapal",
    reference: "PESA-4481029",
    status: "SUCCESS",
  },
];

export async function customerPortalRoutes(app: FastifyInstance): Promise<void> {
  // 1. Customer Profile & Overview
  app.get(
    "/:tenantSlug/me",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, name: true, slug: true, brandColor: true, logoUrl: true },
      });

      reply.send(
        successResponse(
          {
            tenant: tenant || { name: "FiberConnect", slug: tenantSlug, brandColor: "#2563eb" },
            customer: DEFAULT_CUSTOMER_DATA,
          },
          request.id
        )
      );
    }
  );

  // 2. Auth: Phone OTP Request
  app.post(
    "/:tenantSlug/auth/phone",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = z.object({ phone: z.string().min(8) }).parse(request.body);
      reply.send(
        successResponse(
          {
            success: true,
            phone: body.phone,
            message: `OTP sent successfully to ${body.phone}. Use OTP: 123456`,
            devOtp: "123456",
          },
          request.id
        )
      );
    }
  );

  // 3. Auth: Verify OTP
  app.post(
    "/:tenantSlug/auth/verify-otp",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = z.object({ phone: z.string().min(8), otp: z.string().min(4) }).parse(request.body);
      if (body.otp !== "123456" && body.otp !== "000000" && body.otp.length < 4) {
        return reply.status(400).send({ success: false, error: { message: "Invalid OTP entered" } });
      }

      reply.send(
        successResponse(
          {
            token: "portal_jwt_mock_token_" + Date.now(),
            customer: {
              ...DEFAULT_CUSTOMER_DATA,
              phone: body.phone,
            },
          },
          request.id
        )
      );
    }
  );

  // 4. Auth: Link Existing Account
  app.post(
    "/:tenantSlug/auth/link",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = z
        .object({
          accountNumber: z.string().optional(),
          phone: z.string().optional(),
          idNumber: z.string().optional(),
        })
        .parse(request.body);

      reply.send(
        successResponse(
          {
            linked: true,
            customer: DEFAULT_CUSTOMER_DATA,
            message: "Account linked successfully!",
          },
          request.id
        )
      );
    }
  );

  // 5. Packages Catalog (Internet + TV)
  app.get(
    "/:tenantSlug/packages",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      reply.send(
        successResponse(
          {
            internet: DEFAULT_INTERNET_PACKAGES,
            tv: DEFAULT_TV_PACKAGES,
          },
          request.id
        )
      );
    }
  );

  // 6. Initiate Payment (M-Pesa STK Push / Pesapal)
  app.post(
    "/:tenantSlug/pay",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = z
        .object({
          packageId: z.string(),
          serviceType: z.enum(["INTERNET", "TV", "OUTSTANDING_BALANCE"]),
          amount: z.number().positive(),
          phone: z.string().min(8),
          paymentMethod: z.enum(["MPESA", "PESAPAL", "CARD"]),
        })
        .parse(request.body);

      const checkoutRequestId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      reply.send(
        successResponse(
          {
            checkoutRequestId,
            status: "PENDING",
            message: `STK Push prompt sent to ${body.phone}. Please enter your M-Pesa PIN on your phone.`,
            amount: body.amount,
            phone: body.phone,
            serviceType: body.serviceType,
          },
          request.id
        )
      );
    }
  );

  // 7. Check Payment Status & Auto-Activate
  app.get(
    "/:tenantSlug/pay/status/:checkoutRequestId",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { checkoutRequestId } = z.object({ checkoutRequestId: z.string() }).parse(request.params);

      // Auto-succeed in dev/demo flow
      reply.send(
        successResponse(
          {
            checkoutRequestId,
            status: "SUCCESS",
            receiptNumber: "RCP-" + Math.floor(100000 + Math.random() * 900000),
            transactionReference: "QGH" + Math.floor(1000000 + Math.random() * 9000000),
            newExpiryDate: "30 Sept 2026",
            message: "Payment verified successfully. Your service is now fully active!",
          },
          request.id
        )
      );
    }
  );

  // 8. Payment History / Transactions
  app.get(
    "/:tenantSlug/transactions",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      reply.send(successResponse(DEFAULT_TRANSACTIONS, request.id));
    }
  );

  // 9. Referral Program
  app.get(
    "/:tenantSlug/referrals",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      reply.send(
        successResponse(
          {
            referralCode: DEFAULT_CUSTOMER_DATA.referralCode,
            shareUrl: `https://fiberconnect.co.ke/register?ref=${DEFAULT_CUSTOMER_DATA.referralCode}`,
            rewardPerReferralKes: 100,
            stats: DEFAULT_CUSTOMER_DATA.referralStats,
            recentReferrals: [
              { name: "John Kamau", date: "22 Aug 2026", status: "COMPLETED", rewardKes: 100 },
              { name: "Faith Wambui", date: "15 Aug 2026", status: "COMPLETED", rewardKes: 100 },
              { name: "Peter Ochieng", date: "10 Aug 2026", status: "PENDING_PAYMENT", rewardKes: 0 },
            ],
          },
          request.id
        )
      );
    }
  );

  // 10. Support Tickets & Complaints
  app.get(
    "/:tenantSlug/tickets",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      reply.send(successResponse(DEFAULT_TICKETS, request.id));
    }
  );

  app.post(
    "/:tenantSlug/tickets",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = z
        .object({
          subject: z.string().min(3),
          category: z.string().min(2),
          description: z.string().min(5),
        })
        .parse(request.body);

      const newTicket = {
        id: `FC-${Math.floor(10000 + Math.random() * 90000)}`,
        subject: body.subject,
        category: body.category,
        status: "OPEN",
        createdAt: "Just now",
        messages: [{ sender: "customer", text: body.description, time: "Just now" }],
      };

      reply.send(successResponse(newTicket, request.id));
    }
  );

  // 11. Connected Devices
  app.get(
    "/:tenantSlug/devices",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      reply.send(successResponse(DEFAULT_DEVICES, request.id));
    }
  );

  app.post(
    "/:tenantSlug/devices/:deviceId/toggle",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { deviceId } = z.object({ deviceId: z.string() }).parse(request.params);
      const dev = DEFAULT_DEVICES.find((d) => d.id === deviceId);
      if (dev) {
        dev.isBlocked = !dev.isBlocked;
      }
      reply.send(successResponse({ deviceId, isBlocked: dev?.isBlocked ?? false }, request.id));
    }
  );

  // 12. Network & Outage Status
  app.get(
    "/:tenantSlug/status",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      reply.send(
        successResponse(
          {
            internet: "OPERATIONAL",
            tv: "OPERATIONAL",
            payments: "OPERATIONAL",
            support: "OPERATIONAL",
            overallStatusText: "All Systems Operational",
            outages: [],
            upcomingMaintenance: null,
          },
          request.id
        )
      );
    }
  );
}
