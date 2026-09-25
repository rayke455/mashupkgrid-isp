"use client";

import Link from "next/link";
import { ThemeManager } from "@/components/theme-manager";
import { Panel, darkButton } from "@/components/dashboard/surface";

export function AdvancedTab() {
  return (
    <div className="space-y-6">
      <Panel
        title="Captive Portal Studio"
        description="Portal add-ons: announcements, social links, ads, live chat and other extras on the sign-in page."
        actions={
          <Link href="/captive-customizer" className={darkButton("secondary", "sm")}>
            Open Studio
          </Link>
        }
      >
        <p className="text-sm text-slate-400">
          Most ISPs don&apos;t need these. Each add-on makes the sign-in page heavier, so it loads slower on weak connections.
        </p>
      </Panel>

      <div>
        <h2 className="text-base font-semibold text-white">Dashboard colours</h2>
        <p className="mb-3 mt-1 text-sm text-slate-400">How this dashboard looks to you and your staff. Customers don&apos;t see this.</p>
        <ThemeManager />
      </div>
    </div>
  );
}
