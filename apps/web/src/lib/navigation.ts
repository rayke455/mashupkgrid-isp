import type { CurrentUser } from "@/lib/auth-context";

/**
 * The dashboard's map: every destination, grouped the way an ISP works through a day. The
 * sidebar, the command palette (Ctrl/⌘ K) and the header breadcrumb all render from this one
 * list, so a page cannot be reachable from one and missing from another.
 *
 * Icons are named, not rendered, so this file stays plain data that can be searched and tested
 * without React.
 */

export type NavIcon =
  | "dashboard"
  | "bell"
  | "users"
  | "package"
  | "invoice"
  | "lifebuoy"
  | "ticket"
  | "pulse"
  | "router"
  | "layers"
  | "pool"
  | "speed"
  | "mpesa"
  | "maintenance"
  | "message"
  | "shield"
  | "session"
  | "tenants"
  | "lock"
  | "sparkles"
  | "automation";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Extra words the palette should match on ("M-Pesa" for "Getting paid", say). */
  keywords?: string;
  /** Active only on this exact path, for section roots like /payments. */
  exact?: boolean;
  /** Opens in a new tab (the hardware store is a separate, public surface). */
  external?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** A shortcut to something you do, rather than somewhere you go. Palette only. */
export interface NavAction {
  id: string;
  label: string;
  href: string;
  hint: string;
}

type Has = (permission: string) => boolean;

function tenantSections(has: Has): NavSection[] {
  return [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard", keywords: "home overview" },
        { href: "/notifications", label: "Notifications", icon: "bell", keywords: "inbox announcements" },
      ],
    },
    {
      title: "Customers",
      items: [
        ...(has("customers.read") ? [{ href: "/customers", label: "Customers", icon: "users", keywords: "subscribers pppoe" } as NavItem] : []),
        ...(has("customers.read") ? [{ href: "/online-users", label: "Online now", icon: "pulse", keywords: "sessions active users hotspot pppoe who is connected tracking" } as NavItem] : []),
        ...(has("packages.read") ? [{ href: "/packages", label: "Internet plans", icon: "package", keywords: "packages rate plans speed" } as NavItem] : []),
        ...(has("billing.read") ? [{ href: "/invoices", label: "Invoices", icon: "invoice", keywords: "billing bills" } as NavItem] : []),
        ...(has("tickets.read") ? [{ href: "/tickets", label: "Support tickets", icon: "lifebuoy", keywords: "helpdesk complaints" } as NavItem] : []),
      ],
    },
    {
      title: "Hotspot",
      items: [
        ...(has("radius.manage") ? [{ href: "/vouchers", label: "Hotspot", icon: "ticket", keywords: "vouchers captive portal wifi" } as NavItem] : []),
        ...(has("payments.read") ? [{ href: "/purchase-attempts", label: "Purchase attempts", icon: "pulse", keywords: "hotspot checkout failed" } as NavItem] : []),
        ...(has("radius.manage") ? [{ href: "/captive-customizer", label: "Portal designer", icon: "sparkles", keywords: "captive portal theme login page" } as NavItem] : []),
      ],
    },
    {
      title: "Network",
      items: [
        ...(has("routers.read") ? [{ href: "/routers", label: "Routers", icon: "router", keywords: "mikrotik nas" } as NavItem] : []),
        ...(has("vlans.read") ? [{ href: "/vlans", label: "VLANs", icon: "layers", keywords: "segments tagging" } as NavItem] : []),
        ...(has("routers.read") ? [{ href: "/ip-pools", label: "IP pools", icon: "pool", keywords: "addresses dhcp" } as NavItem] : []),
        ...(has("reports.read") ? [{ href: "/reports", label: "Bandwidth usage", icon: "speed", keywords: "reports traffic revenue export" } as NavItem] : []),
      ],
    },
    {
      // The MashupHost gateway, collections, balance and settlements: money held on a tenant's
      // behalf is the platform's largest liability, so it stays one clear group.
      title: "Money",
      items: [
        ...(has("payments.read")
          ? ([
              { href: "/payments", label: "Payments", icon: "dashboard", exact: true, keywords: "collections gateway" },
              { href: "/payments/transactions", label: "Transactions", icon: "mpesa", keywords: "payments history" },
              { href: "/payments/balance", label: "Balance", icon: "invoice", keywords: "wallet available" },
              { href: "/payments/settlements", label: "Settlements", icon: "layers", keywords: "payouts withdraw" },
            ] as NavItem[])
          : []),
        ...(has("settings.manage") || has("payments.reconcile")
          ? // One entry, not four: M-Pesa, Paystack and Pesapal answer one question for an operator.
            [{ href: "/payments-setup", label: "Getting paid", icon: "mpesa", keywords: "m-pesa paystack pesapal till paybill" } as NavItem]
          : []),
      ],
    },
    {
      title: "Account",
      items: [
        ...(has("settings.manage") ? [{ href: "/settings", label: "Settings", icon: "maintenance", keywords: "branding domain billing" } as NavItem] : []),
        ...(has("settings.manage") ? [{ href: "/automation", label: "Automation", icon: "automation", keywords: "jobs scheduler worker billing cycle dunning" } as NavItem] : []),
        ...(has("settings.manage") ? [{ href: "/sms", label: "SMS gateway", icon: "message", keywords: "communications" } as NavItem] : []),
        { href: "/app", label: "Customer mobile app", icon: "layers", keywords: "fiberconnect android" },
        { href: "/shop", label: "Hardware store", icon: "package", keywords: "buy routers antennas", external: true },
        ...(has("audit_logs.read") ? [{ href: "/audit-log", label: "Audit log", icon: "shield", keywords: "history who changed" } as NavItem] : []),
        { href: "/sessions", label: "My sessions", icon: "session", keywords: "devices sign out" },
      ],
    },
  ];
}

function platformSections(has: Has): NavSection[] {
  return [
    {
      items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard", keywords: "home overview" }],
    },
    {
      title: "Platform",
      items: [
        ...(has("tenants.read") ? [{ href: "/tenants", label: "Tenants", icon: "tenants", keywords: "isps customers accounts" } as NavItem] : []),
        ...(has("tenants.update") ? [{ href: "/admin/notifications", label: "Notifications", icon: "bell", keywords: "announce broadcast" } as NavItem] : []),
        ...(has("plans.manage") ? [{ href: "/plans", label: "Subscription plans", icon: "layers", keywords: "pricing tiers" } as NavItem] : []),
        ...(has("maintenance.manage") ? [{ href: "/maintenance", label: "Maintenance mode", icon: "maintenance", keywords: "downtime" } as NavItem] : []),
        ...(has("maintenance.manage") ? [{ href: "/automation", label: "Automation", icon: "automation", keywords: "jobs scheduler worker queues" } as NavItem] : []),
        ...(has("maintenance.manage") ? [{ href: "/admin/walled-garden", label: "Walled garden", icon: "shield", keywords: "hotspot allowed hosts before login paywall" } as NavItem] : []),
      ],
    },
    {
      title: "Payments",
      items: has("platform_payments.read")
        ? [
            { href: "/admin/payments", label: "Overview", icon: "dashboard", exact: true, keywords: "gateway collections" },
            { href: "/admin/payments/transactions", label: "Transactions", icon: "mpesa" },
            { href: "/admin/payments/settlements", label: "Settlements", icon: "layers", keywords: "payouts" },
            { href: "/admin/payments/reconciliation", label: "Reconciliation", icon: "shield", keywords: "unmatched" },
            { href: "/admin/payments/gateway", label: "Payment gateway", icon: "lock" },
            { href: "/admin/payments/fees", label: "Fees", icon: "invoice", keywords: "commission settlement policy" },
            { href: "/admin/payments/webhooks", label: "Webhooks", icon: "pulse" },
          ]
        : [],
    },
    {
      title: "Store",
      items: has("tenants.read")
        ? [
            { href: "/admin/products", label: "Hardware & pricing", icon: "package", keywords: "store catalog" },
            { href: "/admin/orders", label: "Hardware orders", icon: "invoice" },
          ]
        : [],
    },
    {
      title: "Website",
      items: has("maintenance.manage")
        ? [
            { href: "/landing-editor", label: "Landing page", icon: "sparkles", keywords: "homepage marketing" },
            { href: "/testimonials", label: "Testimonials", icon: "message" },
          ]
        : [],
    },
    {
      title: "Integrations",
      items: has("tenants.create")
        ? [
            { href: "/platform-mpesa", label: "Platform M-Pesa", icon: "mpesa", keywords: "daraja" },
            { href: "/platform-google-signin", label: "Google sign-in", icon: "lock", keywords: "oauth" },
            { href: "/platform-whatsapp", label: "Platform WhatsApp", icon: "message" },
          ]
        : [],
    },
    { title: "Account", items: [{ href: "/sessions", label: "My sessions", icon: "session", keywords: "devices sign out" }] },
  ];
}

/** Only the sections and items this user may see. Empty sections are dropped. */
export function buildNavSections(user: Pick<CurrentUser, "tenantId" | "permissions">): NavSection[] {
  const has: Has = (permission) => user.permissions.includes(permission);
  const sections = user.tenantId === null ? platformSections(has) : tenantSections(has);
  return sections.filter((section) => section.items.length > 0);
}

/** Things worth a shortcut: each is a page plus the intent that takes you there. */
export function buildNavActions(user: Pick<CurrentUser, "tenantId" | "permissions">): NavAction[] {
  const has: Has = (permission) => user.permissions.includes(permission);
  if (user.tenantId === null) {
    return [
      ...(has("tenants.create") ? [{ id: "new-tenant", label: "Add an ISP", href: "/tenants", hint: "Tenants" }] : []),
      ...(has("maintenance.manage") ? [{ id: "maintenance", label: "Schedule maintenance", href: "/maintenance", hint: "Maintenance mode" }] : []),
    ];
  }
  return [
    ...(has("customers.create") ? [{ id: "new-customer", label: "Add a customer", href: "/customers", hint: "Customers" }] : []),
    ...(has("routers.manage") ? [{ id: "new-router", label: "Link a router", href: "/routers/new", hint: "Network" }] : []),
    ...(has("billing.read") ? [{ id: "overdue", label: "See overdue invoices", href: "/invoices", hint: "Invoices" }] : []),
    ...(has("radius.manage") ? [{ id: "vouchers", label: "Print hotspot vouchers", href: "/vouchers", hint: "Hotspot" }] : []),
  ];
}

export function isNavItemActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The section and item the current URL belongs to, for the breadcrumb. Prefers the longest
 *  matching href so /payments/balance resolves to "Balance", not the "/payments" root. */
export function findCurrentNav(sections: NavSection[], pathname: string | null): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (!isNavItemActive(item, pathname)) continue;
      if (!best || item.href.length > best.item.href.length) best = { section, item };
    }
  }
  return best;
}

/**
 * Ranks items against what someone typed. Every word must match somewhere (label, section title
 * or keywords); a match at the start of the label outranks one buried in the keywords, so "in"
 * puts "Internet plans" and "Invoices" above "Getting paid (m-pesa ... paybill)".
 */
export function scoreNavMatch(query: string, item: NavItem, sectionTitle?: string): number {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const label = item.label.toLowerCase();
  const haystack = `${label} ${sectionTitle?.toLowerCase() ?? ""} ${item.keywords?.toLowerCase() ?? ""}`;
  let score = 0;
  for (const word of words) {
    if (label.startsWith(word)) score += 3;
    else if (label.split(/\s+/).some((part) => part.startsWith(word))) score += 2;
    else if (haystack.includes(word)) score += 1;
    else return 0;
  }
  return score;
}
