export interface LandingMaintenanceConfig {
  enabled: boolean;
  headline: string;
  message: string;
  estimatedCompletion: string;
  emergencyContact: string;
  bypassSecret: string;
  allowAdminBypass: boolean;
  affectedServices: { name: string; status: "OPERATIONAL" | "MAINTENANCE" | "UPGRADING" }[];
}

export const DEFAULT_LANDING_MAINTENANCE: LandingMaintenanceConfig = {
  enabled: false,
  headline: "Scheduled Platform Upgrade in Progress",
  message: "We are currently performing scheduled infrastructure upgrades to our FreeRADIUS cluster and core MikroTik RouterOS API gateway to deliver faster connection speeds and sub-second M-Pesa activations. Active subscriber connections remain fully operational.",
  estimatedCompletion: "Expected completion in 45 minutes",
  emergencyContact: "+254 700 000 000",
  bypassSecret: "mkg-superadmin-bypass",
  allowAdminBypass: true,
  affectedServices: [
    { name: "Subscriber PPPoE & Hotspot Traffic", status: "OPERATIONAL" },
    { name: "Safaricom M-Pesa STK Gateway", status: "OPERATIONAL" },
    { name: "Core RADIUS AAA Engine", status: "UPGRADING" },
    { name: "Public Sign-Up & Landing Registration", status: "MAINTENANCE" },
  ],
};

const STORAGE_KEY = "mkg_landing_maintenance_config";

export function getLandingMaintenanceConfig(): LandingMaintenanceConfig {
  if (typeof window === "undefined") {
    return DEFAULT_LANDING_MAINTENANCE;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LANDING_MAINTENANCE;
    return { ...DEFAULT_LANDING_MAINTENANCE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LANDING_MAINTENANCE;
  }
}

export function saveLandingMaintenanceConfig(config: LandingMaintenanceConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    // Dispatch custom event for real-time reactivity across tabs
    window.dispatchEvent(new Event("mkg_maintenance_change"));
  } catch (err) {
    console.error("Failed to save landing maintenance config:", err);
  }
}
