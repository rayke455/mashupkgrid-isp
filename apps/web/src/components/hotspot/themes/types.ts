export interface HotspotPackage {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  dataCapMb: number | null;
  downloadKbps: number | null;
  uploadKbps: number | null;
  isPopular?: boolean;
  badge?: string | null;
  simultaneousUse?: number;
  blockTethering?: boolean;
  appPolicy?: string | null;
}

export type SocialAppPolicy =
  | "ALL"
  | "TIKTOK_ONLY"
  | "YOUTUBE_ONLY"
  | "FACEBOOK_ONLY"
  | "INSTAGRAM_ONLY"
  | "WHATSAPP_ONLY"
  | "SOCIAL_BUNDLE";

export interface SocialAppMeta {
  policy: SocialAppPolicy;
  name: string;
  shortLabel: string;
  icon: string;
  badgeBg: string;
  badgeText: string;
  border: string;
}

export const SOCIAL_APP_CATALOG: Record<SocialAppPolicy, SocialAppMeta> = {
  ALL: {
    policy: "ALL",
    name: "Full Internet Access",
    shortLabel: "Full Internet",
    icon: "🌐",
    badgeBg: "bg-blue-500/10 dark:bg-blue-500/20",
    badgeText: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
  },
  TIKTOK_ONLY: {
    policy: "TIKTOK_ONLY",
    name: "TikTok Only",
    shortLabel: "TikTok",
    icon: "🎵",
    badgeBg: "bg-pink-500/10 dark:bg-pink-500/20",
    badgeText: "text-pink-600 dark:text-pink-400",
    border: "border-pink-500/30",
  },
  YOUTUBE_ONLY: {
    policy: "YOUTUBE_ONLY",
    name: "YouTube Only",
    shortLabel: "YouTube",
    icon: "▶️",
    badgeBg: "bg-red-500/10 dark:bg-red-500/20",
    badgeText: "text-red-600 dark:text-red-400",
    border: "border-red-500/30",
  },
  FACEBOOK_ONLY: {
    policy: "FACEBOOK_ONLY",
    name: "Facebook Only",
    shortLabel: "Facebook",
    icon: "📘",
    badgeBg: "bg-indigo-500/10 dark:bg-indigo-500/20",
    badgeText: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-500/30",
  },
  INSTAGRAM_ONLY: {
    policy: "INSTAGRAM_ONLY",
    name: "Instagram Only",
    shortLabel: "Instagram",
    icon: "📸",
    badgeBg: "bg-rose-500/10 dark:bg-rose-500/20",
    badgeText: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/30",
  },
  WHATSAPP_ONLY: {
    policy: "WHATSAPP_ONLY",
    name: "WhatsApp Only",
    shortLabel: "WhatsApp",
    icon: "💬",
    badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
  },
  SOCIAL_BUNDLE: {
    policy: "SOCIAL_BUNDLE",
    name: "All Socials Bundle",
    shortLabel: "All Socials",
    icon: "🔥",
    badgeBg: "bg-amber-500/10 dark:bg-amber-500/20",
    badgeText: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
  },
};

export function getSocialAppMeta(policy?: string | null): SocialAppMeta {
  const norm = (policy || "ALL").toUpperCase().trim() as SocialAppPolicy;
  return SOCIAL_APP_CATALOG[norm] || SOCIAL_APP_CATALOG.ALL;
}

export interface VoucherLoginResult {
  status: "UNUSED" | "ACTIVE" | "EXPIRED" | "USED";
  expiresAt: string | null;
  durationMinutes: number | null;
  dataCapMb: number | null;
}

export interface AccountLoginResult {
  username: string;
}

export interface CaptiveThemeProps {
  tenantSlug: string;
  tenantName: string;
  contactPhone: string;
  supportPhone?: string;
  welcomeTitle?: string;
  bannerSubtitle?: string;
  installationFee?: string;
  fiberRates?: Array<{ speed: string; price: string; subtitle?: string }>;
  /** Already set by every tenant in Settings; previously never reached the one surface a
   *  customer actually sees. Absent or invalid means render the existing text-only branding —
   *  no theme should ever fail to render for a tenant who hasn't set either. */
  logoUrl?: string | null;
  brandColor?: string | null;
  packages: HotspotPackage[] | undefined;
  loadingPackages: boolean;
  onSelectPackage: (pkg: HotspotPackage) => void;
  onOpenVoucherModal: () => void;
  onOpenAccountModal: () => void;
  onOpenTvModal: () => void;
  voucherResult: VoucherLoginResult | null;
  accountResult: AccountLoginResult | null;
  completingRouterLogin: boolean;
}

export type ThemeId =
  | "gold-energy"
  | "suntech-blue"
  | "modern-glass"
  | "vibrant-retail"
  | "hospitality-clean"
  | "cyberpunk-neon";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  category: string;
  description: string;
  badgeColor: string;
  accentColor: string;
}
