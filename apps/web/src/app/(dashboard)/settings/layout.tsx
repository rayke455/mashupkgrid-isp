"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  IconMaintenance,
  IconPalette,
  IconRouter,
  IconTicket,
  IconMpesa,
  IconInvoice,
  IconMessage,
  IconWebhook,
  IconLock,
  IconChevronRight,
  IconSparkles,
  IconChat,
  IconGlobe,
  IconLayers,
} from "@/components/icons";

interface SettingsNavItem {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  show: boolean;
}

interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const has = (permission: string) => user?.permissions.includes(permission) ?? false;

  const groups: SettingsNavGroup[] = [
    {
      label: "General",
      items: [
        {
          href: "/settings",
          label: "Branding",
          hint: "Identity, logo, colors",
          icon: <IconPalette size={16} />,
          show: has("settings.manage"),
        },
        {
          href: "/settings/domains",
          label: "Domain Management",
          hint: "Subdomain & custom domain",
          icon: <IconGlobe size={16} />,
          show: has("settings.manage"),
        },
        {
          href: "/settings/billing",
          label: "My Subscription",
          hint: "Plan, usage & renewal",
          icon: <IconLayers size={16} />,
          show: has("settings.manage"),
        },
      ],
    },
    {
      label: "Network",
      items: [
        {
          href: "/routers",
          label: "Routers",
          hint: "MikroTik NAS devices",
          icon: <IconRouter size={16} />,
          show: has("routers.read"),
        },
        {
          href: "/vouchers",
          label: "Hotspot vouchers",
          hint: "Captive portal, vouchers",
          icon: <IconTicket size={16} />,
          show: has("radius.manage"),
        },
      ],
    },
    {
      label: "Billing & messaging",
      items: [
        {
          // One entry covering every way of getting paid — see the tabbed page for why these
          // stopped being three separate destinations.
          href: "/payments-setup",
          label: "Getting paid",
          hint: "Till, paybill, M-Pesa, cards",
          icon: <IconMpesa size={16} />,
          show: has("settings.manage") || has("payments.reconcile"),
        },
        {
          href: "/sms",
          label: "Communications",
          hint: "SMS gateway",
          icon: <IconMessage size={16} />,
          show: has("settings.manage"),
        },
      ],
    },
    {
      label: "Integrations",
      items: [
        {
          href: "/settings/ai-assistant",
          label: "AI Assistant",
          hint: "Provider & API key",
          icon: <IconSparkles size={16} />,
          show: has("settings.manage"),
        },
        {
          href: "/settings/developer",
          label: "Developer",
          hint: "API tokens & webhooks",
          icon: <IconWebhook size={16} />,
          show: has("settings.manage"),
        },
        {
          href: "/settings/whatsapp",
          label: "WhatsApp",
          hint: "Link your number",
          icon: <IconMessage size={16} />,
          show: has("settings.manage"),
        },
        {
          href: "/settings/live-chat",
          label: "Live Chat",
          hint: "Tawk.to widget",
          icon: <IconChat size={16} />,
          show: has("settings.manage"),
        },
      ],
    },
    {
      label: "Account",
      items: [
        {
          href: "/settings/account",
          label: "Password",
          hint: "Sign-in security",
          icon: <IconLock size={16} />,
          show: true,
        },
      ],
    },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="shrink-0 lg:w-64">
        <div className="mb-4">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <IconMaintenance size={18} />
            </span>
            Settings
          </h1>
        </div>
        <nav className="space-y-5">
          {groups.map((group) => {
            const visible = group.items.filter((item) => item.show);
            if (visible.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {visible.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-all ${
                        isActive(item.href)
                          ? "bg-brand-50 text-brand-700 font-semibold dark:bg-brand-950/70 dark:text-brand-300"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-obsidian-850"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={
                            isActive(item.href)
                              ? "text-brand-600 dark:text-brand-400"
                              : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                          }
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{item.label}</span>
                          <span className="block truncate text-[11px] font-normal text-slate-400">{item.hint}</span>
                        </span>
                      </span>
                      <IconChevronRight
                        size={14}
                        className="shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-600"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
