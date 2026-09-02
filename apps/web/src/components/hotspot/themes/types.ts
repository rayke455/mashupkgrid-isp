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
