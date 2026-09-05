import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { successResponse } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const landingContentSchema = z.object({
  announcement: z
    .object({ badge: z.string(), text: z.string(), linkText: z.string(), linkUrl: z.string() })
    .partial()
    .optional(),
  hero: z
    .object({
      statusBadge: z.string(),
      mainHeadingStart: z.string(),
      mainHeadingGradient: z.string(),
      mainHeadingEnd: z.string(),
      description: z.string(),
      primaryCtaText: z.string(),
      primaryCtaUrl: z.string(),
      secondaryCtaText: z.string(),
      secondaryCtaUrl: z.string(),
    })
    .partial()
    .optional(),
  roiCalculator: z
    .object({
      title: z.string(),
      subtitle: z.string(),
      defaultSubscribers: z.number(),
      defaultArpu: z.number(),
      currency: z.string(),
    })
    .partial()
    .optional(),
  scripts: z
    .object({ title: z.string(), subtitle: z.string(), defaultHost: z.string(), defaultSecret: z.string() })
    .partial()
    .optional(),
  pricing: z
    .object({
      title: z.string(),
      subtitle: z.string(),
      starterMonthly: z.number(),
      starterAnnual: z.number(),
      growthMonthly: z.number(),
      growthAnnual: z.number(),
      carrierMonthly: z.number(),
      carrierAnnual: z.number(),
    })
    .partial()
    .optional(),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  footer: z
    .object({ description: z.string(), copyrightYear: z.string(), supportEmail: z.string(), supportPhone: z.string() })
    .partial()
    .optional(),
});

export interface LandingContent {
  announcement: {
    badge: string;
    text: string;
    linkText: string;
    linkUrl: string;
  };
  hero: {
    statusBadge: string;
    mainHeadingStart: string;
    mainHeadingGradient: string;
    mainHeadingEnd: string;
    description: string;
    primaryCtaText: string;
    primaryCtaUrl: string;
    secondaryCtaText: string;
    secondaryCtaUrl: string;
  };
  roiCalculator: {
    title: string;
    subtitle: string;
    defaultSubscribers: number;
    defaultArpu: number;
    currency: string;
  };
  scripts: {
    title: string;
    subtitle: string;
    defaultHost: string;
    defaultSecret: string;
  };
  pricing: {
    title: string;
    subtitle: string;
    starterMonthly: number;
    starterAnnual: number;
    growthMonthly: number;
    growthAnnual: number;
    carrierMonthly: number;
    carrierAnnual: number;
  };
  faqs: Array<{
    q: string;
    a: string;
  }>;
  footer: {
    description: string;
    copyrightYear: string;
    supportEmail: string;
    supportPhone: string;
  };
}

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  announcement: {
    badge: "ROUTEROS V7.14",
    text: "Automated WhatsApp Bot, Live Captive Portal Studio & GIS Outage Pinpointer",
    linkText: "Explore Live →",
    linkUrl: "#innovations",
  },
  hero: {
    statusBadge: "Next-Gen FreeRADIUS & ISP Automation Suite",
    mainHeadingStart: "Automate Your ISP Billing &",
    mainHeadingGradient: "MikroTik Network",
    mainHeadingEnd: "with Zero Leakage.",
    description:
      "The all-in-one cloud platform for Kenyan & East African WISPs and Fiber ISPs. Eliminate manual Paybill reconciliations, automate PPPoE speed throttling on MikroTik, dispatch hotspot vouchers, and cut revenue leakage to zero.",
    primaryCtaText: "Start 14-Day Free Trial",
    primaryCtaUrl: "/register",
    secondaryCtaText: "Live Console Sandbox",
    secondaryCtaUrl: "#demo",
  },
  roiCalculator: {
    title: "Calculate Your Prevented Revenue Leakage & Admin Time Saved",
    subtitle:
      "See the exact financial impact of automated Safaricom M-Pesa collections and instant MikroTik queue provisioning.",
    defaultSubscribers: 350,
    defaultArpu: 2500,
    currency: "KES",
  },
  scripts: {
    title: "Deploy to Any MikroTik Router in 30 Seconds",
    subtitle:
      "Paste these production-hardened commands directly into Winbox or SSH. Works with RouterOS v6.48+ and v7.12+.",
    defaultHost: "197.248.42.10",
    defaultSecret: "mkg_radius_secret_x91",
  },
  pricing: {
    title: "Predictable Plans Engineered for ISP Profitability",
    subtitle:
      "No hidden per-router licensing fees. All core RADIUS accounting, M-Pesa STK, and MikroTik sync features included.",
    starterMonthly: 3500,
    starterAnnual: 2800,
    growthMonthly: 7500,
    growthAnnual: 6000,
    carrierMonthly: 18000,
    carrierAnnual: 14400,
  },
  faqs: [
    {
      q: "Does Mashupkgrid ISP work with both MikroTik RouterOS v6 and v7?",
      a: "Yes. Our native RouterOS client communicates directly with RouterOS v6.48+ LTS through the modern v7.12+ REST and API-TLS protocols. It automatically handles fast routing, active queues, interface address lists, and PPPoE binding without needing any external agents.",
    },
    {
      q: "How does the Safaricom M-Pesa STK Push and Paybill reconciliation work?",
      a: "When a subscriber pays via your Safaricom Paybill or initiates an instant STK push prompt from the customer portal, our Daraja 2.0 gateway matches the Paybill account number with the subscriber's account. Within 1.5 seconds, the ledger is credited, the invoice is marked PAID, and a RADIUS CoA disconnect signal is sent to the MikroTik router to un-throttle their speed instantly.",
    },
    {
      q: "Can I manage multiple MikroTik routers and distributed POPs?",
      a: "Absolutely. You can attach an unlimited number of core routers, base stations, and edge switches across multiple geographic sites. Each router is continuously monitored with real-time CPU, RAM, temperature, and link latency metrics.",
    },
    {
      q: "Does the platform support high-volume hotspot voucher printing?",
      a: "Yes. You can generate thousands of hotspot vouchers in batches with custom prefixes, expiration hours, and upload/download data quotas. Print them in customizable 3x8 or 4x10 grid voucher sheets with QR codes for instantaneous subscriber phone camera logins.",
    },
    {
      q: "Can I white-label the dashboard with my own ISP logo and custom domain?",
      a: "Yes! Mashupkgrid ISP features full multi-tenant white-labeling. You can set your own ISP brand name, primary theme colors, custom logo, and host the customer portal on your own domain (e.g., portal.yourisp.co.ke).",
    },
  ],
  footer: {
    description:
      "Precision billing, native MikroTik RouterOS API control, FreeRADIUS subscriber accounting, and automated Safaricom M-Pesa collections for telecom operators in East Africa.",
    copyrightYear: "2026",
    supportEmail: "support@mashupkgrid.com",
    supportPhone: "+254 703 605 266",
  },
};

const STORAGE_FILE = path.resolve(process.cwd(), "landing-content.json");

function loadLandingContent(): LandingContent {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, "utf-8");
      return { ...DEFAULT_LANDING_CONTENT, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error("Error reading landing content file:", err);
  }
  return DEFAULT_LANDING_CONTENT;
}

function persistLandingContent(content: LandingContent): void {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(content, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing landing content file:", err);
  }
}

let cachedContent = loadLandingContent();

export async function landingContentRoutes(app: FastifyInstance): Promise<void> {
  // Public GET: anyone loading the landing page fetches current content
  app.get("/", { config: { audience: "public" } }, async (request, reply) => {
    reply.send(successResponse(cachedContent, request.id));
  });

  // Admin POST: update content
  app.post(
    "/",
    {
      config: { audience: "platform" },
      preHandler: [...preHandler, requirePermission("tenants.update")],
    },
    async (request, reply) => {
      const body = landingContentSchema.parse(request.body);
      // Merge one section at a time rather than a blind top-level spread: a caller updating
      // just `hero.primaryCtaText` should not wipe out the rest of `hero`'s fields.
      cachedContent = {
        announcement: { ...cachedContent.announcement, ...body.announcement },
        hero: { ...cachedContent.hero, ...body.hero },
        roiCalculator: { ...cachedContent.roiCalculator, ...body.roiCalculator },
        scripts: { ...cachedContent.scripts, ...body.scripts },
        pricing: { ...cachedContent.pricing, ...body.pricing },
        faqs: body.faqs ?? cachedContent.faqs,
        footer: { ...cachedContent.footer, ...body.footer },
      };
      persistLandingContent(cachedContent);

      await writeAuditLog({
        tenantId: null,
        actorUserId: request.user!.id,
        action: "landing_content.updated",
        resourceType: "LandingContent",
        resourceId: "global-landing",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(cachedContent, request.id));
    }
  );
}
