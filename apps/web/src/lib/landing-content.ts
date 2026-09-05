import { apiFetch } from "./api-client";

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
    // The heading is the strongest on-page ranking signal there is, and it previously named
    // neither what this is (a Wi-Fi billing system) nor where it operates (Kenya) — the two
    // things a buyer types into Google. Rewritten to say both in plain words, without becoming
    // a keyword list: it still reads as a sentence a human wrote.
    statusBadge: "M-Pesa billing · MikroTik · RADIUS · Hotspot vouchers",
    mainHeadingStart: "The Wi-Fi Billing System for",
    mainHeadingGradient: "ISPs in Kenya",
    mainHeadingEnd: "that pays you on time.",
    description:
      "Sell hotspot vouchers and monthly internet packages, take M-Pesa payments that activate service automatically, and manage every MikroTik router, PPPoE session and customer from one dashboard. Built for Kenyan WISPs, fibre ISPs and hotspot operators.",
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
    // The first three exist because they are the questions a Kenyan operator types verbatim into
    // a search box. They are real answers, not keyword bait — a page that ranks for a question it
    // does not answer loses the visitor in seconds, which search engines measure.
    {
      q: "What is a Wi-Fi billing system, and do I need one in Kenya?",
      a: "A Wi-Fi billing system sells and enforces internet access automatically: a customer pays, the system issues them a voucher or activates their package, and the router lets them online for exactly what they paid for. If you run a hotspot or a small ISP in Kenya and you are still confirming M-Pesa messages by hand and typing usernames into your router, that is the manual work a billing system removes.",
    },
    {
      q: "Can customers pay for Wi-Fi with M-Pesa, and does it connect them automatically?",
      a: "Yes. A customer picks a package on your captive portal, receives an M-Pesa STK push on their phone, and once Safaricom confirms the payment their voucher is issued and their session starts — with no action from you. Paybill and Buy Goods (Till) numbers are both supported, and the money goes to your own M-Pesa account, not ours.",
    },
    {
      q: "Does it work with MikroTik routers I already own?",
      a: "Yes. Setup is a single script you paste into your router's terminal, which configures the hotspot, the captive portal, RADIUS authentication and the payment walled garden in one step. There is no proprietary hardware to buy and nothing to replace.",
    },
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

const STORAGE_KEY = "mkg_landing_page_cms";

export function getLandingContent(): LandingContent {
  if (typeof window === "undefined") {
    return DEFAULT_LANDING_CONTENT;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LANDING_CONTENT;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_LANDING_CONTENT,
      ...parsed,
      announcement: { ...DEFAULT_LANDING_CONTENT.announcement, ...(parsed.announcement || {}) },
      hero: { ...DEFAULT_LANDING_CONTENT.hero, ...(parsed.hero || {}) },
      roiCalculator: { ...DEFAULT_LANDING_CONTENT.roiCalculator, ...(parsed.roiCalculator || {}) },
      scripts: { ...DEFAULT_LANDING_CONTENT.scripts, ...(parsed.scripts || {}) },
      pricing: { ...DEFAULT_LANDING_CONTENT.pricing, ...(parsed.pricing || {}) },
      faqs: Array.isArray(parsed.faqs) && parsed.faqs.length > 0 ? parsed.faqs : DEFAULT_LANDING_CONTENT.faqs,
      footer: { ...DEFAULT_LANDING_CONTENT.footer, ...(parsed.footer || {}) },
    };
  } catch {
    return DEFAULT_LANDING_CONTENT;
  }
}

/**
 * The currently PUBLISHED landing copy, from the server.
 *
 * The editor must load this rather than localStorage. Reading local state meant an operator who
 * opened the editor on a different browser or device saw factory defaults instead of what is
 * actually live — and pressing Save from that state would overwrite the published copy with
 * those defaults, silently wiping real content. Falls back to whatever is available locally so
 * the editor still opens when the API is unreachable.
 */
export async function fetchPublishedLandingContent(): Promise<LandingContent> {
  try {
    const remote = await apiFetch<Partial<LandingContent>>("/api/v1/landing-content", { skipAuth: true });
    if (!remote || typeof remote !== "object") return getLandingContent();
    return {
      ...DEFAULT_LANDING_CONTENT,
      ...remote,
      announcement: { ...DEFAULT_LANDING_CONTENT.announcement, ...(remote.announcement ?? {}) },
      hero: { ...DEFAULT_LANDING_CONTENT.hero, ...(remote.hero ?? {}) },
      roiCalculator: { ...DEFAULT_LANDING_CONTENT.roiCalculator, ...(remote.roiCalculator ?? {}) },
      scripts: { ...DEFAULT_LANDING_CONTENT.scripts, ...(remote.scripts ?? {}) },
      pricing: { ...DEFAULT_LANDING_CONTENT.pricing, ...(remote.pricing ?? {}) },
      faqs: Array.isArray(remote.faqs) && remote.faqs.length > 0 ? remote.faqs : DEFAULT_LANDING_CONTENT.faqs,
      footer: { ...DEFAULT_LANDING_CONTENT.footer, ...(remote.footer ?? {}) },
    };
  } catch {
    return getLandingContent();
  }
}

export async function saveLandingContent(content: LandingContent): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
      window.dispatchEvent(new Event("mkg_landing_content_change"));
    } catch (err) {
      console.error("Failed to save landing content locally", err);
    }
  }

  // Attempt backend persistence
  try {
    await apiFetch("/api/v1/landing-content", {
      method: "POST",
      body: JSON.stringify(content),
    });
  } catch {
    // Local persistence will keep working even if unauthenticated
  }
}

export async function resetLandingContent(): Promise<LandingContent> {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("mkg_landing_content_change"));
  }
  try {
    await apiFetch("/api/v1/landing-content", {
      method: "POST",
      body: JSON.stringify(DEFAULT_LANDING_CONTENT),
    });
  } catch {
    // ignore
  }
  return DEFAULT_LANDING_CONTENT;
}
