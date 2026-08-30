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

const STORAGE_KEY = "mkg_captive_portal_plugins_v2";

export function getCaptivePortalPluginsState(): CaptivePortalPluginsState {
  if (typeof window === "undefined") {
    return DEFAULT_PLUGINS_STATE;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLUGINS_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PLUGINS_STATE,
      ...parsed,
      theme: { ...DEFAULT_PLUGINS_STATE.theme, ...(parsed.theme || {}) },
      customizer: { ...DEFAULT_PLUGINS_STATE.customizer, ...(parsed.customizer || {}) },
      animation: { ...DEFAULT_PLUGINS_STATE.animation, ...(parsed.animation || {}) },
      backgroundFx: { ...DEFAULT_PLUGINS_STATE.backgroundFx, ...(parsed.backgroundFx || {}) },
      mascots: Array.isArray(parsed.mascots) && parsed.mascots.length > 0 ? parsed.mascots : DEFAULT_MASCOTS,
      loginUi: { ...DEFAULT_PLUGINS_STATE.loginUi, ...(parsed.loginUi || {}) },
      buttonEffects: { ...DEFAULT_PLUGINS_STATE.buttonEffects, ...(parsed.buttonEffects || {}) },
      loadingScreen: { ...DEFAULT_PLUGINS_STATE.loadingScreen, ...(parsed.loadingScreen || {}) },
      ads: { ...DEFAULT_PLUGINS_STATE.ads, ...(parsed.ads || {}) },
      announcements: { ...DEFAULT_PLUGINS_STATE.announcements, ...(parsed.announcements || {}) },
      sound: { ...DEFAULT_PLUGINS_STATE.sound, ...(parsed.sound || {}) },
      language: { ...DEFAULT_PLUGINS_STATE.language, ...(parsed.language || {}) },
      mobileOpt: { ...DEFAULT_PLUGINS_STATE.mobileOpt, ...(parsed.mobileOpt || {}) },
      qrCode: { ...DEFAULT_PLUGINS_STATE.qrCode, ...(parsed.qrCode || {}) },
      packageDisplay: { ...DEFAULT_PLUGINS_STATE.packageDisplay, ...(parsed.packageDisplay || {}) },
      paymentUi: { ...DEFAULT_PLUGINS_STATE.paymentUi, ...(parsed.paymentUi || {}) },
      userDashboard: { ...DEFAULT_PLUGINS_STATE.userDashboard, ...(parsed.userDashboard || {}) },
      notification: { ...DEFAULT_PLUGINS_STATE.notification, ...(parsed.notification || {}) },
      support: { ...DEFAULT_PLUGINS_STATE.support, ...(parsed.support || {}) },
      social: { ...DEFAULT_PLUGINS_STATE.social, ...(parsed.social || {}) },
      analytics: { ...DEFAULT_PLUGINS_STATE.analytics, ...(parsed.analytics || {}) },
      pluginMasterToggles: { ...DEFAULT_PLUGINS_STATE.pluginMasterToggles, ...(parsed.pluginMasterToggles || {}) },
      customCss: { ...DEFAULT_PLUGINS_STATE.customCss, ...(parsed.customCss || {}) },
      customJs: { ...DEFAULT_PLUGINS_STATE.customJs, ...(parsed.customJs || {}) },
      backup: { ...DEFAULT_PLUGINS_STATE.backup, ...(parsed.backup || {}) },
    };
  } catch (err) {
    console.error("Failed to load portal plugins state:", err);
    return DEFAULT_PLUGINS_STATE;
  }
}

export function saveCaptivePortalPluginsState(state: CaptivePortalPluginsState): void {
  if (typeof window === "undefined") return;
  try {
    const updated = {
      ...state,
      backup: {
        ...state.backup,
        lastBackupDate: new Date().toISOString(),
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("mkg_portal_plugin_change", { detail: updated }));
  } catch (err) {
    console.error("Failed to save portal plugins state:", err);
  }
}

export function resetCaptivePortalPluginsState(): CaptivePortalPluginsState {
  saveCaptivePortalPluginsState(DEFAULT_PLUGINS_STATE);
  return DEFAULT_PLUGINS_STATE;
}

export function exportPluginsConfigJson(): string {
  const state = getCaptivePortalPluginsState();
  return JSON.stringify(state, null, 2);
}

export function importPluginsConfigJson(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString) as Partial<CaptivePortalPluginsState>;
    if (!parsed || typeof parsed !== "object") return false;
    const merged: CaptivePortalPluginsState = {
      ...DEFAULT_PLUGINS_STATE,
      ...parsed,
      mascots: Array.isArray(parsed.mascots) ? parsed.mascots : DEFAULT_MASCOTS,
    };
    saveCaptivePortalPluginsState(merged);
    return true;
  } catch (err) {
    console.error("Failed to import config JSON:", err);
    return false;
  }
}
