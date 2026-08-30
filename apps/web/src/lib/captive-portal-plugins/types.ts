export type EdgeZone =
  | "top-left"
  | "top-right"
  | "left-center"
  | "right-center"
  | "bottom-left"
  | "bottom-right";

export type MascotAnimation =
  | "float"
  | "bounce"
  | "wiggle"
  | "shake"
  | "swing"
  | "pulse"
  | "rotate"
  | "slide"
  | "fade"
  | "random";

export type MascotCharacterId =
  | "yellow-boy"
  | "tom-cat"
  | "jerry-mouse"
  | "spongebob"
  | "ben-10"
  | "spider-hero"
  | "mickey-mouse"
  | "bugs-bunny"
  | "wendy-girl"
  | "sonic-speed"
  | "electric-mouse"
  | "super-plumber"
  | "ninja-shinobi"
  | "saiyan-warrior"
  | "dark-knight"
  | "iron-avenger"
  | "green-ogre"
  | "yellow-minion"
  | "blue-robot-cat"
  | "spinach-sailor"
  | "mystery-dog"
  | "savanna-lion"
  | "kung-fu-panda"
  | "sailor-duck"
  | "pink-starfish"
  | "ninja-turtle"
  | "cyber-android"
  | "cyber-girl"
  | "speedy-cheetah"
  | "space-astronaut"
  | "cyber-cat"
  | "tech-robot"
  | "ninja-fox"
  | "gamer-panda"
  | "superhero-eagle"
  | "retro-mouse"
  | "pirate-parrot"
  | "soccer-star"
  | "anime-fox"
  | "custom";

export interface MascotConfig {
  id: string;
  name: string;
  characterId: MascotCharacterId;
  customImageUrl?: string;
  zone: EdgeZone;
  enabled: boolean;
  sizePx: number;
  mobileSizePx: number;
  rotationDeg: number;
  opacity: number;
  animation: MascotAnimation;
  animationSpeedSec: number;
  hideOnMobile: boolean;
  xOffsetPercent?: number; // Custom drag & drop desktop offset
  yOffsetPercent?: number;
  mobileXOffsetPercent?: number;
  mobileYOffsetPercent?: number;
}

export interface AdvancedThemeConfig {
  enabled: boolean;
  mode: "dark" | "light" | "auto";
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  backgroundGradient: string;
  fontFamily: string;
  borderRadiusPx: number;
  shadowIntensity: "none" | "subtle" | "neon-glow" | "deep";
}

export interface LiveCustomizerConfig {
  enabled: boolean;
  portalTitle: string;
  portalSubtitle: string;
  brandName: string;
  brandLogoUrl: string;
  cardPosition: "center" | "left" | "right";
  cardTransparency: number;
  cardBlurPx: number;
}

export interface AnimationConfig {
  enabled: boolean;
  pageEntrance: "fade" | "slide-up" | "zoom-in" | "bounce" | "none";
  cardHoverEffect: "lift" | "glow" | "tilt" | "pulse" | "none";
  buttonMicroAnimation: boolean;
  speedMultiplier: number;
  respectReducedMotion: boolean;
}

export interface BackgroundFxConfig {
  enabled: boolean;
  effectType: "particles" | "floating-bubbles" | "stars" | "waves" | "cyber-grid" | "gradient-shift" | "custom-media";
  customMediaUrl?: string;
  mediaType?: "image" | "video";
  density: number;
  speed: number;
  color: string;
}

export interface LoginUiCustomizerConfig {
  enabled: boolean;
  cardWidthPx: number;
  inputVariant: "filled" | "outlined" | "glass";
  showNetworkBadge: boolean;
  networkBadgeText: string;
  showVoucherTab: boolean;
  showMemberTab: boolean;
  showPayAsYouGoTab: boolean;
}

export interface ButtonEffectsConfig {
  enabled: boolean;
  rippleOnClick: boolean;
  neonGlow: boolean;
  pulseOnHover: boolean;
  gradientShift: boolean;
  borderRadius: number;
}

export interface LoadingScreenConfig {
  enabled: boolean;
  showMascot: boolean;
  mascotCharacterId: MascotCharacterId;
  loadingTitle: string;
  loadingSubtitle: string;
  minDisplayDurationMs: number;
  progressBarColor: string;
}

export interface AdItem {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  targetUrl: string;
  badge: string;
  enabled: boolean;
  clickCount?: number;
}

export interface AdvertisementConfig {
  enabled: boolean;
  rotationIntervalSec: number;
  placement: "banner-top" | "card-bottom" | "modal-popup";
  allowDismiss: boolean;
  ads: AdItem[];
}

export interface AnnouncementItem {
  id: string;
  text: string;
  type: "info" | "promo" | "warning";
  linkUrl?: string;
  enabled: boolean;
}

export interface AnnouncementConfig {
  enabled: boolean;
  style: "marquee" | "top-pill" | "modal-alert";
  scrollSpeedSec: number;
  items: AnnouncementItem[];
}

export interface SoundConfig {
  enabled: boolean;
  masterVolume: number;
  buttonClicks: boolean;
  successChime: boolean;
  errorBuzz: boolean;
  ambientMusic: boolean;
}

export interface LanguageConfig {
  enabled: boolean;
  defaultLanguage: "en" | "sw";
  allowUserSwitch: boolean;
  customPhrasesEn: Record<string, string>;
  customPhrasesSw: Record<string, string>;
}

export interface MobileOptConfig {
  enabled: boolean;
  compactCards: boolean;
  disableHeavyCanvasOnMobile: boolean;
  reducedMotionOnMobile: boolean;
  minimumTouchTargetPx: number;
}

export interface QrCodeConfig {
  enabled: boolean;
  ssid: string;
  encryption: "WPA" | "WPA2" | "nopass";
  password?: string;
  showVoucherCameraScanner: boolean;
  qrColor: string;
  qrBackground: string;
}

export interface PackageDisplayConfig {
  enabled: boolean;
  layout: "grid" | "carousel" | "compact-list";
  highlightFeaturedPackage: boolean;
  featuredPackageId?: string;
  showSpeedBadges: boolean;
  showDurationBadges: boolean;
}

export interface PaymentUiConfig {
  enabled: boolean;
  showMpesaRadarAnimation: boolean;
  showConfettiOnSuccess: boolean;
  stkPushTimeoutSec: number;
  customSuccessMessage: string;
}

export interface UserDashboardConfig {
  enabled: boolean;
  showFloatingWidget: boolean;
  widgetPosition: "bottom-right" | "bottom-left" | "top-right";
  showRemainingQuota: boolean;
  showSessionClock: boolean;
  showLiveSpeed: boolean;
  allowDisconnectButton: boolean;
}

export interface NotificationConfig {
  enabled: boolean;
  position: "top-right" | "bottom-center" | "top-center";
  durationSec: number;
  playAudioCue: boolean;
}

export interface SupportConfig {
  enabled: boolean;
  whatsappNumber: string;
  whatsappGreeting: string;
  phoneDialNumber: string;
  showFaqModal: boolean;
  faqs: { q: string; a: string }[];
}

export interface SocialLinksConfig {
  enabled: boolean;
  position: "floating-left" | "floating-right" | "footer-inline";
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  xTwitter?: string;
  youtube?: string;
  telegram?: string;
}

export interface AnalyticsEvent {
  id: string;
  type: "impression" | "voucher_attempt" | "voucher_success" | "package_click" | "payment_initiated" | "payment_success" | "ad_click";
  timestamp: string;
  deviceType: "mobile" | "tablet" | "desktop";
  metadata?: Record<string, unknown>;
}

export interface AnalyticsConfig {
  enabled: boolean;
  events: AnalyticsEvent[];
  maxStoredEvents: number;
}

export interface CustomCssConfig {
  enabled: boolean;
  cssContent: string;
}

export interface CustomJsConfig {
  enabled: boolean;
  jsContent: string;
  executeOnLoad: boolean;
}

export interface BackupImportConfig {
  lastBackupDate?: string;
  version: string;
}

/** Master State of the 30 Plugins */
export interface CaptivePortalPluginsState {
  // 1. Advanced Theme
  theme: AdvancedThemeConfig;
  // 2. Live Page Customizer
  customizer: LiveCustomizerConfig;
  // 3. Animation Plugin
  animation: AnimationConfig;
  // 4. Animated Background Plugin
  backgroundFx: BackgroundFxConfig;
  // 5. Cartoon/Mascot Plugin + 6. Edge Zones + 7. Mascot Animations + 8. Gallery + 9. Drag & Drop + 10. Responsive Mascots
  mascots: MascotConfig[];
  mascotsMasterEnabled: boolean;
  // 11. Login UI Customizer
  loginUi: LoginUiCustomizerConfig;
  // 12. Button Effects Plugin
  buttonEffects: ButtonEffectsConfig;
  // 13. Loading Screen Plugin
  loadingScreen: LoadingScreenConfig;
  // 14. Advertisement Plugin
  ads: AdvertisementConfig;
  // 15. Announcement Plugin
  announcements: AnnouncementConfig;
  // 16. Music & Sound Plugin
  sound: SoundConfig;
  // 17. Language Plugin
  language: LanguageConfig;
  // 18. Mobile Optimization Plugin
  mobileOpt: MobileOptConfig;
  // 19. QR Code Plugin
  qrCode: QrCodeConfig;
  // 20. Package Display Plugin
  packageDisplay: PackageDisplayConfig;
  // 21. Payment UI Plugin
  paymentUi: PaymentUiConfig;
  // 22. User Dashboard Plugin
  userDashboard: UserDashboardConfig;
  // 23. Notification Plugin
  notification: NotificationConfig;
  // 24. Support Plugin
  support: SupportConfig;
  // 25. Social Links Plugin
  social: SocialLinksConfig;
  // 26. Analytics Plugin
  analytics: AnalyticsConfig;
  // 27. Admin Plugin Master Switchboard
  pluginMasterToggles: Record<string, boolean>;
  // 28. Custom CSS Plugin
  customCss: CustomCssConfig;
  // 29. Custom JavaScript Plugin
  customJs: CustomJsConfig;
  // 30. Backup & Import Plugin
  backup: BackupImportConfig;
}
