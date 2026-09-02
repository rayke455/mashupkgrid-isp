import { CaptivePortalPluginsState, MascotConfig } from "./types";

export const DEFAULT_MASCOTS: MascotConfig[] = [
  {
    id: "mascot-top-left",
    name: "Speedy Cheetah",
    characterId: "speedy-cheetah",
    zone: "top-left",
    enabled: true,
    sizePx: 95,
    mobileSizePx: 65,
    rotationDeg: -5,
    opacity: 0.95,
    animation: "float",
    animationSpeedSec: 3.5,
    hideOnMobile: false,
    xOffsetPercent: 2,
    yOffsetPercent: 2,
  },
  {
    id: "mascot-top-right",
    name: "Cyber Cat",
    characterId: "cyber-cat",
    zone: "top-right",
    enabled: true,
    sizePx: 90,
    mobileSizePx: 60,
    rotationDeg: 8,
    opacity: 0.95,
    animation: "wiggle",
    animationSpeedSec: 4.2,
    hideOnMobile: false,
    xOffsetPercent: 2,
    yOffsetPercent: 2,
  },
  {
    id: "mascot-left-center",
    name: "Tech Robot",
    characterId: "tech-robot",
    zone: "left-center",
    enabled: true,
    sizePx: 85,
    mobileSizePx: 55,
    rotationDeg: 0,
    opacity: 0.9,
    animation: "pulse",
    animationSpeedSec: 2.8,
    hideOnMobile: true, // Hidden on small phone screens so login form is wide
    xOffsetPercent: 1,
    yOffsetPercent: 45,
  },
  {
    id: "mascot-right-center",
    name: "Ninja Fox",
    characterId: "ninja-fox",
    zone: "right-center",
    enabled: true,
    sizePx: 85,
    mobileSizePx: 55,
    rotationDeg: -6,
    opacity: 0.9,
    animation: "swing",
    animationSpeedSec: 3.8,
    hideOnMobile: true,
    xOffsetPercent: 1,
    yOffsetPercent: 45,
  },
  {
    id: "mascot-bottom-left",
    name: "Gamer Panda",
    characterId: "gamer-panda",
    zone: "bottom-left",
    enabled: true,
    sizePx: 100,
    mobileSizePx: 70,
    rotationDeg: 4,
    opacity: 0.95,
    animation: "bounce",
    animationSpeedSec: 3.0,
    hideOnMobile: false,
    xOffsetPercent: 2,
    yOffsetPercent: 2,
  },
  {
    id: "mascot-bottom-right",
    name: "Superhero Eagle",
    characterId: "superhero-eagle",
    zone: "bottom-right",
    enabled: true,
    sizePx: 105,
    mobileSizePx: 70,
    rotationDeg: -8,
    opacity: 0.95,
    animation: "float",
    animationSpeedSec: 4.0,
    hideOnMobile: false,
    xOffsetPercent: 2,
    yOffsetPercent: 2,
  },
];

export const DEFAULT_PLUGINS_STATE: CaptivePortalPluginsState = {
  theme: {
    enabled: true,
    mode: "dark",
    primaryColor: "#6366f1",
    secondaryColor: "#10b981",
    accentColor: "#f59e0b",
    backgroundColor: "#030712",
    backgroundGradient: "linear-gradient(135deg, #030712 0%, #0f172a 50%, #1e1b4b 100%)",
    fontFamily: "Inter, sans-serif",
    borderRadiusPx: 16,
    shadowIntensity: "neon-glow",
  },
  customizer: {
    enabled: true,
    portalTitle: "High-Speed Wi-Fi Portal",
    portalSubtitle: "Select a package or redeem your voucher to connect instantly.",
    brandName: "MASHUPKGRID TELECOM",
    brandLogoUrl: "/logo.jpg",
    cardPosition: "center",
    cardTransparency: 0.92,
    cardBlurPx: 16,
  },
  animation: {
    enabled: true,
    pageEntrance: "zoom-in",
    cardHoverEffect: "lift",
    buttonMicroAnimation: true,
    speedMultiplier: 1.0,
    respectReducedMotion: true,
  },
  backgroundFx: {
    enabled: true,
    effectType: "particles",
    density: 35,
    speed: 1.2,
    color: "#6366f1",
  },
  mascots: DEFAULT_MASCOTS,
  mascotsMasterEnabled: true,
  loginUi: {
    enabled: true,
    cardWidthPx: 460,
    inputVariant: "glass",
    showNetworkBadge: true,
    networkBadgeText: "Ultra Fast 5G / Fiber Wi-Fi",
    showVoucherTab: true,
    showMemberTab: true,
    showPayAsYouGoTab: true,
  },
  buttonEffects: {
    enabled: true,
    rippleOnClick: true,
    neonGlow: true,
    pulseOnHover: true,
    gradientShift: true,
    borderRadius: 12,
  },
  loadingScreen: {
    enabled: true,
    showMascot: true,
    mascotCharacterId: "speedy-cheetah",
    loadingTitle: "Authenticating Wi-Fi Session…",
    loadingSubtitle: "Contacting core RADIUS accounting engine",
    minDisplayDurationMs: 1200,
    progressBarColor: "#10b981",
  },
  ads: {
    enabled: false,
    rotationIntervalSec: 8,
    placement: "banner-top",
    allowDismiss: true,
    ads: [
      {
        id: "ad-1",
        title: "⚡ Unlimited Monthly Fiber",
        description: "Upgrade your home or business to dedicated gigabit fiber speeds today.",
        targetUrl: "https://mashupkgrid.com",
        badge: "SPONSORED",
        enabled: true,
        clickCount: 0,
      },
    ],
  },
  announcements: {
    enabled: true,
    style: "top-pill",
    scrollSpeedSec: 15,
    items: [
      {
        id: "ann-1",
        text: "⚡ High-speed fiber upgrades completed! Enjoy 4K streaming with zero buffering.",
        type: "promo",
        enabled: true,
      },
    ],
  },
  sound: {
    enabled: true,
    masterVolume: 0.6,
    buttonClicks: true,
    successChime: true,
    errorBuzz: true,
    ambientMusic: false,
  },
  language: {
    enabled: true,
    defaultLanguage: "en",
    allowUserSwitch: true,
    customPhrasesEn: {},
    customPhrasesSw: {},
  },
  mobileOpt: {
    enabled: true,
    compactCards: true,
    disableHeavyCanvasOnMobile: false,
    reducedMotionOnMobile: false,
    minimumTouchTargetPx: 48,
  },
  qrCode: {
    enabled: true,
    ssid: "MASHUPKGRID-FIBER-FREE",
    encryption: "nopass",
    showVoucherCameraScanner: true,
    qrColor: "#ffffff",
    qrBackground: "#0f172a",
  },
  packageDisplay: {
    enabled: true,
    layout: "grid",
    highlightFeaturedPackage: true,
    showSpeedBadges: true,
    showDurationBadges: true,
  },
  paymentUi: {
    enabled: true,
    showMpesaRadarAnimation: true,
    showConfettiOnSuccess: true,
    stkPushTimeoutSec: 60,
    customSuccessMessage: "M-Pesa payment received! You are now connected.",
  },
  userDashboard: {
    enabled: true,
    showFloatingWidget: true,
    widgetPosition: "bottom-right",
    showRemainingQuota: true,
    showSessionClock: true,
    showLiveSpeed: true,
    allowDisconnectButton: true,
  },
  notification: {
    enabled: true,
    position: "top-right",
    durationSec: 4,
    playAudioCue: true,
  },
  support: {
    enabled: true,
    whatsappNumber: "+254700000000",
    whatsappGreeting: "Hello! I need assistance with the Wi-Fi hotspot captive portal.",
    phoneDialNumber: "+254700000000",
    showFaqModal: true,
    faqs: [
      {
        q: "How do I buy Wi-Fi with M-Pesa?",
        a: "Select your desired package, enter your Safaricom phone number, and accept the STK PIN prompt on your phone. You will be connected instantly.",
      },
      {
        q: "Where do I find my voucher PIN?",
        a: "If you bought a printed scratch card, enter the 8-character code in the Voucher tab. If bought via M-Pesa, the code is also sent via SMS.",
      },
      {
        q: "Can I use one voucher on multiple devices?",
        a: "Each voucher connects one device at a time for maximum bandwidth performance.",
      },
    ],
  },
  social: {
    enabled: true,
    position: "footer-inline",
    facebook: "https://facebook.com",
    instagram: "https://instagram.com",
    tiktok: "https://tiktok.com",
    xTwitter: "https://x.com",
    youtube: "https://youtube.com",
  },
  analytics: {
    enabled: true,
    events: [],
    maxStoredEvents: 200,
  },
  pluginMasterToggles: {
    theme: true,
    customizer: true,
    animation: true,
    backgroundFx: true,
    mascots: true,
    loginUi: true,
    buttonEffects: true,
    loadingScreen: true,
    ads: false,
    announcements: true,
    sound: true,
    language: true,
    mobileOpt: true,
    qrCode: true,
    packageDisplay: true,
    paymentUi: true,
    userDashboard: true,
    notification: true,
    support: true,
    social: true,
    analytics: true,
    customCss: true,
    customJs: true,
    backup: true,
  },
  customCss: {
    enabled: false,
    cssContent: `/* Custom CSS overrides for Captive Portal */
.mkg-captive-custom-glow {
  box-shadow: 0 0 25px rgba(99, 102, 241, 0.4);
}`,
  },
  customJs: {
    enabled: false,
    jsContent: `// Custom JavaScript for Captive Portal
// console.log("Captive portal custom script initialized");`,
    executeOnLoad: false,
  },
  backup: {
    version: "2.0.0",
    lastBackupDate: new Date().toISOString(),
  },
};

/**
 * Storage was a single unscoped key shared by every tenant on one browser. Two real bugs came
 * from that: switching between tenants' editors on the same admin device showed one tenant's
 * mascots and support number on another's preview, and — the one that actually mattered — a real
 * customer's browser has never had ANY tenant's config in it, so every visitor saw 100% factory
 * defaults no matter what an operator configured. Scoping the key per tenant fixes the first;
 * fetching from the server (below) fixes the second, which is the one that was actually breaking
 * things for real customers.
 */
function storageKey(tenantSlug: string): string {
  return "mkg_captive_portal_plugins_v2:" + tenantSlug;
}

/** The full section-by-section merge onto defaults, shared by the localStorage path and the
 *  server path so a partial or stale blob from either source degrades the same safe way: a
 *  missing or malformed section falls back to its own default rather than the whole state
 *  reverting to factory settings over one bad field. */
function mergePluginsState(
  parsed: Partial<CaptivePortalPluginsState> | Record<string, unknown>
): CaptivePortalPluginsState {
  const p = parsed as Partial<CaptivePortalPluginsState>;
  return {
    ...DEFAULT_PLUGINS_STATE,
    ...p,
    theme: { ...DEFAULT_PLUGINS_STATE.theme, ...(p.theme || {}) },
    customizer: { ...DEFAULT_PLUGINS_STATE.customizer, ...(p.customizer || {}) },
    animation: { ...DEFAULT_PLUGINS_STATE.animation, ...(p.animation || {}) },
    backgroundFx: { ...DEFAULT_PLUGINS_STATE.backgroundFx, ...(p.backgroundFx || {}) },
    mascots: Array.isArray(p.mascots) && p.mascots.length > 0 ? p.mascots : DEFAULT_MASCOTS,
    loginUi: { ...DEFAULT_PLUGINS_STATE.loginUi, ...(p.loginUi || {}) },
    buttonEffects: { ...DEFAULT_PLUGINS_STATE.buttonEffects, ...(p.buttonEffects || {}) },
    loadingScreen: { ...DEFAULT_PLUGINS_STATE.loadingScreen, ...(p.loadingScreen || {}) },
    ads: { ...DEFAULT_PLUGINS_STATE.ads, ...(p.ads || {}) },
    announcements: { ...DEFAULT_PLUGINS_STATE.announcements, ...(p.announcements || {}) },
    sound: { ...DEFAULT_PLUGINS_STATE.sound, ...(p.sound || {}) },
    language: { ...DEFAULT_PLUGINS_STATE.language, ...(p.language || {}) },
    mobileOpt: { ...DEFAULT_PLUGINS_STATE.mobileOpt, ...(p.mobileOpt || {}) },
    qrCode: { ...DEFAULT_PLUGINS_STATE.qrCode, ...(p.qrCode || {}) },
    packageDisplay: { ...DEFAULT_PLUGINS_STATE.packageDisplay, ...(p.packageDisplay || {}) },
    paymentUi: { ...DEFAULT_PLUGINS_STATE.paymentUi, ...(p.paymentUi || {}) },
    userDashboard: { ...DEFAULT_PLUGINS_STATE.userDashboard, ...(p.userDashboard || {}) },
    notification: { ...DEFAULT_PLUGINS_STATE.notification, ...(p.notification || {}) },
    support: { ...DEFAULT_PLUGINS_STATE.support, ...(p.support || {}) },
    social: { ...DEFAULT_PLUGINS_STATE.social, ...(p.social || {}) },
    analytics: { ...DEFAULT_PLUGINS_STATE.analytics, ...(p.analytics || {}) },
    pluginMasterToggles: { ...DEFAULT_PLUGINS_STATE.pluginMasterToggles, ...(p.pluginMasterToggles || {}) },
    customCss: { ...DEFAULT_PLUGINS_STATE.customCss, ...(p.customCss || {}) },
    customJs: { ...DEFAULT_PLUGINS_STATE.customJs, ...(p.customJs || {}) },
    backup: { ...DEFAULT_PLUGINS_STATE.backup, ...(p.backup || {}) },
  };
}

/** The editor's own live-preview cache for ONE tenant, in the ADMIN's own browser. Never the
 *  source of truth for what a real customer sees — see fetchPublishedPluginsState for that. */
export function getCaptivePortalPluginsState(tenantSlug: string): CaptivePortalPluginsState {
  if (typeof window === "undefined") {
    return DEFAULT_PLUGINS_STATE;
  }
  try {
    const raw = localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return DEFAULT_PLUGINS_STATE;
    return mergePluginsState(JSON.parse(raw));
  } catch (err) {
    console.error("Failed to load portal plugins state:", err);
    return DEFAULT_PLUGINS_STATE;
  }
}

export function saveCaptivePortalPluginsState(tenantSlug: string, state: CaptivePortalPluginsState): void {
  if (typeof window === "undefined") return;
  try {
    const updated = {
      ...state,
      backup: {
        ...state.backup,
        lastBackupDate: new Date().toISOString(),
      },
    };
    localStorage.setItem(storageKey(tenantSlug), JSON.stringify(updated));
    // Same-tab live preview only: a real customer's browser never fires this event, since
    // nothing in their session calls saveCaptivePortalPluginsState.
    window.dispatchEvent(new CustomEvent("mkg_portal_plugin_change", { detail: updated }));
  } catch (err) {
    console.error("Failed to save portal plugins state:", err);
  }
}

export function resetCaptivePortalPluginsState(tenantSlug: string): CaptivePortalPluginsState {
  saveCaptivePortalPluginsState(tenantSlug, DEFAULT_PLUGINS_STATE);
  return DEFAULT_PLUGINS_STATE;
}

export function exportPluginsConfigJson(tenantSlug: string): string {
  const state = getCaptivePortalPluginsState(tenantSlug);
  return JSON.stringify(state, null, 2);
}

export function importPluginsConfigJson(tenantSlug: string, jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString) as Partial<CaptivePortalPluginsState>;
    if (!parsed || typeof parsed !== "object") return false;
    saveCaptivePortalPluginsState(tenantSlug, mergePluginsState(parsed));
    return true;
  } catch (err) {
    console.error("Failed to import config JSON:", err);
    return false;
  }
}

/**
 * The published state for a tenant's REAL captive portal — what an actual customer sees.
 *
 * This is the fix for the whole customizer: it previously had no way to reach anyone but the
 * editing admin's own browser. Reads the same `pluginsConfig` blob the editor PUTs to
 * `/api/v1/hotspot/:tenantSlug/config`, merged onto the same defaults so a tenant who has never
 * touched the customizer gets a fully-formed default state rather than a sparse or absent one.
 * Any failure (network, tenant not found, API down) falls back to plain defaults — a captive
 * portal must still render when the API is unreachable, which is precisely when a connecting
 * customer is most likely to be looking at it.
 */
export async function fetchPublishedPluginsState(
  tenantSlug: string,
  apiFetch: <T>(path: string, init?: { skipAuth?: boolean }) => Promise<T>
): Promise<CaptivePortalPluginsState> {
  try {
    const config = await apiFetch<{ pluginsConfig?: unknown }>(
      "/api/v1/hotspot/" + tenantSlug + "/config",
      { skipAuth: true }
    );
    if (!config?.pluginsConfig || typeof config.pluginsConfig !== "object") {
      return DEFAULT_PLUGINS_STATE;
    }
    return mergePluginsState(config.pluginsConfig as Partial<CaptivePortalPluginsState>);
  } catch (err) {
    console.error("Failed to fetch published portal plugins state:", err);
    return DEFAULT_PLUGINS_STATE;
  }
}
