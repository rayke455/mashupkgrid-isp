import type { ReactNode } from "react";
import type { NavIcon } from "@/lib/navigation";
import {
  IconAutomation,
  IconBell,
  IconDashboard,
  IconInvoice,
  IconLayers,
  IconLifeBuoy,
  IconLock,
  IconMaintenance,
  IconMessage,
  IconMpesa,
  IconNetworkPool,
  IconPackage,
  IconPulse,
  IconRouter,
  IconSession,
  IconShield,
  IconSparkles,
  IconSpeed,
  IconTenants,
  IconTicket,
  IconUsers,
} from "@/components/icons";

/** Renders a navigation catalog icon name (lib/navigation.ts keeps the catalog React-free). */
export function NavIconGlyph({ name, size = 18 }: { name: NavIcon; size?: number }): ReactNode {
  switch (name) {
    case "dashboard":
      return <IconDashboard size={size} />;
    case "bell":
      return <IconBell size={size} />;
    case "users":
      return <IconUsers size={size} />;
    case "package":
      return <IconPackage size={size} />;
    case "invoice":
      return <IconInvoice size={size} />;
    case "lifebuoy":
      return <IconLifeBuoy size={size} />;
    case "ticket":
      return <IconTicket size={size} />;
    case "pulse":
      return <IconPulse size={size} />;
    case "router":
      return <IconRouter size={size} />;
    case "layers":
      return <IconLayers size={size} />;
    case "pool":
      return <IconNetworkPool size={size} />;
    case "speed":
      return <IconSpeed size={size} />;
    case "mpesa":
      return <IconMpesa size={size} />;
    case "maintenance":
      return <IconMaintenance size={size} />;
    case "message":
      return <IconMessage size={size} />;
    case "shield":
      return <IconShield size={size} />;
    case "session":
      return <IconSession size={size} />;
    case "tenants":
      return <IconTenants size={size} />;
    case "lock":
      return <IconLock size={size} />;
    case "sparkles":
      return <IconSparkles size={size} />;
    case "automation":
      return <IconAutomation size={size} />;
  }
}
