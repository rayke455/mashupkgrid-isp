"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { TawkToWidget } from "@/components/tawk-to-widget";
import { IconLifeBuoy } from "@/components/icons";
import {
  getThemeComponent,
  THEME_CATALOG,
  type HotspotPackage,
  type VoucherLoginResult,
  type AccountLoginResult,
  type ThemeId,
} from "@/components/hotspot/themes";
import { CaptivePortalPluginContainer } from "@/components/hotspot/plugins/CaptivePortalPluginContainer";

interface TenantInfo {
  name: string;
  phone?: string | null;
  supportPhone?: string | null;
  brandName?: string | null;
  welcomeTitle?: string | null;
  bannerSubtitle?: string | null;
  activeThemeId?: ThemeId | null;
  installationFee?: string | null;
  fiberRates?: Array<{ speed: string; price: string; subtitle?: string }> | null;
}

interface PaymentMethodsInfo {
  mpesa: boolean;
  paystack: boolean;
  paystackPublicKey?: string | null;
  pesapal?: boolean;
  pesapalConsumerKey?: string | null;
}

interface PurchaseResponse {
  method?: "MPESA" | "PAYSTACK" | "PESAPAL";
  checkoutRequestId?: string;
  reference?: string;
  authorizationUrl?: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  amountMinor: number;
  phone?: string;
}

interface PurchaseStatusResponse {
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  mpesaReceiptNumber?: string | null;
  voucherCode: string | null;
  resultDesc?: string | null;
  gatewayResponse?: string | null;
}

function formatPriceKsh(priceMinor: number): string {
  const ksh = Math.round(priceMinor / 100);
  return `KES ${ksh.toLocaleString()}`;
}

/** MikroTik's hotspot drops a client's active session the moment their device disconnects from
 *  the WiFi (sleep, walking out of range, switching networks) — reconnecting gets them a fresh
 *  captive-portal redirect even though their voucher's paid-for time hasn't run out. Without
 *  this, "reconnect" means re-typing the voucher code every single time. The voucher code IS
 *  the router credential (see submitRouterLogin's call sites: username=password=code), so
 *  remembering it here is equivalent to a session token — scoped to this one browser, cleared
 *  the moment it expires or fails. Deliberately voucher-only, not account-login: a subscriber's
 *  real account password is a different sensitivity class not worth persisting client-side. */
const REMEMBERED_VOUCHER_PREFIX = "mkg-hotspot-voucher:";

interface RememberedVoucher {
  code: string;
  expiresAt: string;
}

function rememberVoucher(tenantSlug: string, code: string, expiresAt: string | null): void {
  if (!expiresAt) return;
  try {
    localStorage.setItem(REMEMBERED_VOUCHER_PREFIX + tenantSlug, JSON.stringify({ code, expiresAt }));
  } catch {
    // Private browsing / storage blocked — force-reconnect just has nothing to work with.
  }
}

function loadRememberedVoucher(tenantSlug: string): RememberedVoucher | null {
  try {
    const raw = localStorage.getItem(REMEMBERED_VOUCHER_PREFIX + tenantSlug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedVoucher>;
    if (!parsed.code || !parsed.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(REMEMBERED_VOUCHER_PREFIX + tenantSlug);
      return null;
    }
    return { code: parsed.code, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function forgetRememberedVoucher(tenantSlug: string): void {
  try {
    localStorage.removeItem(REMEMBERED_VOUCHER_PREFIX + tenantSlug);
  } catch {
    // ignore
  }
}

function submitRouterLogin(linkLoginOnly: string, username: string, password: string): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = linkLoginOnly;
  form.style.display = "none";
  const fields: Record<string, string> = { username, password };
  for (const name of Object.keys(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = fields[name]!;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function HotspotCaptivePortalPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const searchParams = useSearchParams();
  const linkLoginOnly = searchParams.get("link-login-only");
  const queryTheme = searchParams.get("theme") as ThemeId | null;
  const paystackRef = searchParams.get("paystack") || searchParams.get("ref");
  const pesapalRef = searchParams.get("pesapal");

  // Active Theme Selection
  const [activeThemeId, setActiveThemeId] = useState<ThemeId>(queryTheme || "suntech-blue");
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    if (queryTheme) setActiveThemeId(queryTheme);
  }, [queryTheme]);

  // Modals
  const [selectedPkg, setSelectedPkg] = useState<HotspotPackage | null>(null);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTvModal, setShowTvModal] = useState(false);

  // Payment method selection ("MPESA" | "PAYSTACK" | "PESAPAL")
  const [selectedGateway, setSelectedGateway] = useState<"MPESA" | "PAYSTACK" | "PESAPAL">("MPESA");
  const [buyPhone, setBuyPhone] = useState("");
  const [buyEmail, setBuyEmail] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Login results & router handshake
  const [voucherResult, setVoucherResult] = useState<VoucherLoginResult | null>(null);
  const [accountResult, setAccountResult] = useState<AccountLoginResult | null>(null);
  const [completingRouterLogin, setCompletingRouterLogin] = useState(false);

  // Force-reconnect: replays a still-valid, previously-accepted voucher code without the
  // customer having to type it again after a WiFi disconnect/reconnect.
  const [rememberedVoucher, setRememberedVoucher] = useState<RememberedVoucher | null>(null);
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const autoReconnectAttempted = useRef(false);

  // M-Pesa / Paystack / Pesapal polling
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [activePaystackRef, setActivePaystackRef] = useState<string | null>(paystackRef);
  const [activePesapalRef, setActivePesapalRef] = useState<string | null>(pesapalRef);
  const [pollingStatus, setPollingStatus] = useState<"PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | null>(null);
  const [pollCountdown, setPollCountdown] = useState(60);

  // Contact Support (raises a Ticket for a walk-in customer with no account)
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportName, setSupportName] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: ["hotspot-info", tenantSlug],
    queryFn: () => apiFetch<TenantInfo>(`/api/v1/hotspot/${tenantSlug}/info`, { skipAuth: true }),
  });

  const [localConfig, setLocalConfig] = useState<Partial<TenantInfo> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mkg_hotspot_captive_config");
      if (raw) setLocalConfig(JSON.parse(raw));
    } catch {}
  }, []);

  // Sync theme with tenant backend config or localStorage if no query override
  useEffect(() => {
    if (queryTheme) return;
    const themeToUse = tenant?.activeThemeId || localConfig?.activeThemeId;
    if (themeToUse) {
      setActiveThemeId(themeToUse as ThemeId);
    }
  }, [queryTheme, tenant?.activeThemeId, localConfig?.activeThemeId]);

  const { data: liveChat } = useQuery({
    queryKey: ["hotspot-live-chat", tenantSlug],
    queryFn: () => apiFetch<{ show: boolean; widgetId: string | null }>(`/api/v1/hotspot/${tenantSlug}/live-chat`, {
      skipAuth: true,
    }),
    staleTime: 5 * 60 * 1000,
  });

  const submitSupportTicket = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/hotspot/${tenantSlug}/support-ticket`, {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ name: supportName.trim(), phone: supportPhone.trim() || undefined, message: supportMessage.trim() }),
      }),
    onSuccess: () => {
      setSupportSent(true);
      setSupportName("");
      setSupportPhone("");
      setSupportMessage("");
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to send — please try again"),
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ["hotspot-payment-methods", tenantSlug],
    queryFn: () => apiFetch<PaymentMethodsInfo>(`/api/v1/hotspot/${tenantSlug}/payment-methods`, { skipAuth: true }),
  });

  useEffect(() => {
    if (!paymentMethods) return;
    if (paymentMethods.mpesa) setSelectedGateway("MPESA");
    else if (paymentMethods.pesapal) setSelectedGateway("PESAPAL");
    else if (paymentMethods.paystack) setSelectedGateway("PAYSTACK");
  }, [paymentMethods]);

  const { data: packages, isLoading: loadingPackages } = useQuery({
    queryKey: ["hotspot-packages", tenantSlug],
    queryFn: () => apiFetch<HotspotPackage[]>(`/api/v1/hotspot/${tenantSlug}/packages`, { skipAuth: true }),
  });

  const connectWithVoucher = useMutation({
    mutationFn: (codeToUse?: string) => {
      const finalCode = (codeToUse ?? voucherCode).trim().toUpperCase();
      return apiFetch<VoucherLoginResult>(`/api/v1/hotspot/${tenantSlug}/login`, {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ code: finalCode }),
      });
    },
    onSuccess: (data, codeToUse) => {
      setError(null);
      setAutoReconnecting(false);
      const finalCode = (codeToUse ?? voucherCode).trim().toUpperCase();
      // Remembered *after* a real Access-Accept, not at purchase time — so force-reconnect only
      // ever replays a code the router has actually already accepted once.
      rememberVoucher(tenantSlug, finalCode, data.expiresAt);
      if (data.expiresAt) setRememberedVoucher({ code: finalCode, expiresAt: data.expiresAt });
      if (linkLoginOnly) {
        setCompletingRouterLogin(true);
        submitRouterLogin(linkLoginOnly, finalCode, finalCode);
        return;
      }
      setVoucherResult(data);
      setShowVoucherModal(false);
      setSelectedPkg(null);
    },
    onError: (err) => {
      setVoucherResult(null);
      setAutoReconnecting(false);
      console.error("Voucher error:", err);
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? `Connection error: ${err.message}`
            : "Could not connect — please try again";
      setError(message);
      // A rejected/expired/used code has nothing left to auto-retry with — keeping it around
      // would just mean the next disconnect silently fails the same way again.
      if (err instanceof ApiRequestError) forgetRememberedVoucher(tenantSlug);
    },
  });

  // Load whatever's remembered for this tenant as soon as we're in the browser (SSR has no
  // localStorage), and — the actual force-reconnect — if the router just redirected us here
  // (link-login-only present) with a still-valid remembered code, replay it immediately with no
  // tap required. Runs once per page load; a ref (not state) guards it so it can't refire on
  // every render once linkLoginOnly/tenantSlug settle.
  useEffect(() => {
    const remembered = loadRememberedVoucher(tenantSlug);
    setRememberedVoucher(remembered);
    if (autoReconnectAttempted.current) return;
    if (!linkLoginOnly || !remembered) return;
    autoReconnectAttempted.current = true;
    setAutoReconnecting(true);
    connectWithVoucher.mutate(remembered.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, linkLoginOnly]);

  const forceReconnect = () => {
    if (!rememberedVoucher || !linkLoginOnly) return;
    setError(null);
    setAutoReconnecting(true);
    connectWithVoucher.mutate(rememberedVoucher.code);
  };

  const connectWithAccount = useMutation({
    mutationFn: () =>
      apiFetch<AccountLoginResult>(`/api/v1/hotspot/${tenantSlug}/account-login`, {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ phone: accountPhone.trim(), password: accountPassword }),
      }),
    onSuccess: (data) => {
      setError(null);
      if (linkLoginOnly) {
        setCompletingRouterLogin(true);
        submitRouterLogin(linkLoginOnly, data.username, accountPassword);
        return;
      }
      setAccountResult(data);
      setShowAccountModal(false);
    },
    onError: (err) => {
      setAccountResult(null);
      console.error("Account login error:", err);
      setError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? `Connection error: ${err.message}`
            : "Could not connect — please try again"
      );
    },
  });

  const initiatePurchase = useMutation({
    mutationFn: () =>
      apiFetch<PurchaseResponse>(`/api/v1/hotspot/${tenantSlug}/purchase`, {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({
          hotspotPackageId: selectedPkg!.id,
          phone: buyPhone.trim(),
          email: buyEmail.trim() || undefined,
          method: selectedGateway,
          // Paystack's checkout is a full-page redirect away from this URL and back — without
          // this, the router's link-login-only param (only otherwise living in the address bar)
          // is gone by the time the customer returns, and auto-connect can't happen.
          linkLoginOnly: selectedGateway === "PAYSTACK" ? linkLoginOnly ?? undefined : undefined,
        }),
      }),
    onSuccess: (data) => {
      setError(null);
      if (data.method === "PAYSTACK" && data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      if (data.checkoutRequestId) {
        setCheckoutRequestId(data.checkoutRequestId);
        setPollingStatus("PENDING");
        setPollCountdown(60);
      }
    },
    onError: (err) => {
      console.error("Purchase error:", err);
      setError(err instanceof ApiRequestError ? err.message : "Failed to initiate payment");
    },
  });

  // Paystack Return check
  useEffect(() => {
    if (!activePaystackRef) return;

    let stopped = false;
    const checkPaystack = async () => {
      try {
        const res = await apiFetch<PurchaseStatusResponse>(
          `/api/v1/hotspot/${tenantSlug}/purchase/paystack/${activePaystackRef}/status`,
          { skipAuth: true }
        );
        if (res.status === "COMPLETED" && res.voucherCode && !stopped) {
          connectWithVoucher.mutate(res.voucherCode);
          setActivePaystackRef(null);
        }
      } catch {
        // ignore
      }
    };
    void checkPaystack();
    return () => {
      stopped = true;
    };
  }, [activePaystackRef, tenantSlug, connectWithVoucher]);

  // M-Pesa STK Polling loop
  useEffect(() => {
    if (!checkoutRequestId || pollingStatus !== "PENDING") return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch<PurchaseStatusResponse>(
          `/api/v1/hotspot/${tenantSlug}/purchase/${checkoutRequestId}/status`,
          { skipAuth: true }
        );

        if (res.status === "COMPLETED" && res.voucherCode) {
          setPollingStatus("COMPLETED");
          clearInterval(interval);
          connectWithVoucher.mutate(res.voucherCode);
        } else if (res.status === "FAILED" || res.status === "CANCELLED") {
          setPollingStatus(res.status);
          setError(res.resultDesc || (res.status === "CANCELLED" ? "Payment was cancelled on phone." : "Payment failed."));
          clearInterval(interval);
        }
      } catch {
        // continue polling
      }
    }, 2500);

    const countdown = setInterval(() => {
      setPollCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          clearInterval(countdown);
          setPollingStatus("FAILED");
          setError("Payment timed out. If you paid, check SMS or enter the voucher code below.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdown);
    };
  }, [checkoutRequestId, pollingStatus, tenantSlug, connectWithVoucher]);

  const SelectedThemeComponent = getThemeComponent(activeThemeId);
  const contactPhone = tenant?.phone || localConfig?.phone || tenant?.supportPhone || localConfig?.supportPhone || "0724 165 988";
  const tenantDisplayName = tenant?.brandName || localConfig?.brandName || tenant?.name || "SUNTECH FIBRE";
  const supportPhoneToUse = tenant?.supportPhone || localConfig?.supportPhone || contactPhone;
  const welcomeTitleToUse = tenant?.welcomeTitle || localConfig?.welcomeTitle || undefined;
  const bannerSubtitleToUse = tenant?.bannerSubtitle || localConfig?.bannerSubtitle || undefined;
  const installationFeeToUse = tenant?.installationFee || localConfig?.installationFee || undefined;
  const fiberRatesToUse = tenant?.fiberRates || localConfig?.fiberRates || undefined;

  return (
    <CaptivePortalPluginContainer
      tenantSlug={tenantSlug}
      activeVoucherCode={voucherResult ? voucherCode : rememberedVoucher?.code}
      voucherExpiresAt={voucherResult?.expiresAt || rememberedVoucher?.expiresAt}
      voucherDataCapMb={voucherResult?.dataCapMb}
      isAuthenticating={completingRouterLogin || autoReconnecting}
      onVoucherCodeApplied={(scanned) => {
        setVoucherCode(scanned);
        setShowVoucherModal(true);
      }}
    >
      <div className="relative min-h-screen">
      {liveChat?.show && <TawkToWidget widgetId={liveChat.widgetId} />}

      {/* Contact Support — bottom-left, deliberately opposite corner from Tawk.to's own bubble
          (bottom-right) so the two never overlap when a tenant has both enabled. */}
      <div className="fixed bottom-3 left-3 z-50">
        <button
          type="button"
          onClick={() => {
            setSupportSent(false);
            setShowSupportModal(true);
          }}
          className="rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1.5 text-[11px] font-bold text-slate-200 shadow-xl backdrop-blur-md hover:bg-slate-800 transition-all flex items-center gap-1.5"
        >
          <IconLifeBuoy size={14} />
          <span>Contact Support</span>
        </button>
      </div>

      {/* Floating Theme Switcher Badge on Top Right */}
      <div className="fixed top-2 right-2 z-50">
        <button
          type="button"
          onClick={() => setShowThemePicker((v) => !v)}
          className="rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1 text-[11px] font-bold text-slate-200 shadow-xl backdrop-blur-md hover:bg-slate-800 transition-all flex items-center gap-1.5"
        >
          <span>🎨</span>
          <span className="capitalize">{activeThemeId.replace("-", " ")}</span>
        </button>

        {showThemePicker && (
          <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-700 p-2 shadow-2xl backdrop-blur-xl text-xs space-y-1">
            <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Select Captive Theme
            </div>
            {THEME_CATALOG.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => {
                  setActiveThemeId(theme.id);
                  setShowThemePicker(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium flex items-center justify-between transition-colors ${
                  activeThemeId === theme.id
                    ? "bg-purple-600 text-white font-bold"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>{theme.name.split(" ")[0]} {theme.name.split(" ")[1]}</span>
                {activeThemeId === theme.id && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Force Reconnect — visible whenever we have a still-valid voucher from last time and the
          router redirected us here again (link-login-only present), so a customer whose device
          just fell off the WiFi can get back online in one tap instead of re-entering their code. */}
      {rememberedVoucher && linkLoginOnly && !completingRouterLogin && (
        <div className="fixed top-2 left-2 z-50">
          <button
            type="button"
            onClick={forceReconnect}
            disabled={autoReconnecting || connectWithVoucher.isPending}
            className="rounded-full bg-emerald-600/90 border border-emerald-400 px-3 py-1 text-[11px] font-bold text-white shadow-xl backdrop-blur-md hover:bg-emerald-500 transition-all flex items-center gap-1.5 disabled:opacity-60"
          >
            <span>🔄</span>
            <span>{autoReconnecting || connectWithVoucher.isPending ? "Reconnecting…" : "Force Reconnect"}</span>
          </button>
        </div>
      )}

      {/* Auto-reconnect in progress, before the theme's own "Authenticating…" handshake overlay
          takes over (that one needs completingRouterLogin, which only flips true once the login
          call actually resolves) — without this the normal buy screen would flash first. */}
      {autoReconnecting && !completingRouterLogin && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-xs">
          <div className="rounded-2xl bg-slate-900/95 border border-emerald-500/50 p-6 text-center shadow-2xl">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-3" />
            <p className="text-lg font-black text-emerald-400">Reconnecting you automatically…</p>
            <p className="text-xs text-slate-300 mt-1">Using your active Wi-Fi code from last time.</p>
          </div>
        </div>
      )}

      {/* Render Active Theme Plugin */}
      <SelectedThemeComponent
        tenantSlug={tenantSlug}
        tenantName={tenantDisplayName}
        contactPhone={contactPhone}
        supportPhone={supportPhoneToUse}
        welcomeTitle={welcomeTitleToUse}
        bannerSubtitle={bannerSubtitleToUse}
        installationFee={installationFeeToUse}
        fiberRates={fiberRatesToUse}
        packages={packages}
        loadingPackages={loadingPackages}
        onSelectPackage={(pkg) => {
          setSelectedPkg(pkg);
          setError(null);
        }}
        onOpenVoucherModal={() => {
          setShowVoucherModal(true);
          setError(null);
        }}
        onOpenAccountModal={() => {
          setShowAccountModal(true);
          setError(null);
        }}
        onOpenTvModal={() => setShowTvModal(true)}
        voucherResult={voucherResult}
        accountResult={accountResult}
        completingRouterLogin={completingRouterLogin}
      />

      {/* SHARED MODAL 1: M-PESA BUY MODAL */}
      {selectedPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 text-slate-100 shadow-2xl text-center">
            {pollingStatus === "PENDING" ? (
              <div className="space-y-4 py-3">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 animate-pulse text-3xl font-black">
                  M
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Check Your Phone</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    An M-Pesa PIN prompt for <span className="font-bold text-amber-400">{formatPriceKsh(selectedPkg.priceMinor)}</span> was sent to <span className="font-bold text-white">{buyPhone}</span>.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-950 p-2.5 text-xs font-mono text-amber-300 border border-slate-800">
                  Waiting for PIN confirmation... ({pollCountdown}s)
                </div>
                <Button
                  variant="outline"
                  className="px-4 py-1.5 text-xs text-slate-300"
                  onClick={() => {
                    setCheckoutRequestId(null);
                    setPollingStatus(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  initiatePurchase.mutate();
                }}
                className="space-y-4 text-left"
              >
                <div className="text-center pb-2 border-b border-slate-800">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold block">
                    Instant Wi-Fi Purchase
                  </span>
                  <h3 className="text-xl font-black text-white mt-0.5">{selectedPkg.name}</h3>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    {formatPriceKsh(selectedPkg.priceMinor)}
                  </div>
                </div>

                {/* Gateway Selection Tabs */}
                {((paymentMethods?.mpesa && paymentMethods?.pesapal) ||
                  (paymentMethods?.mpesa && paymentMethods?.paystack) ||
                  (paymentMethods?.pesapal && paymentMethods?.paystack)) && (
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-950 border border-slate-800">
                    {paymentMethods?.mpesa && (
                      <button
                        type="button"
                        onClick={() => setSelectedGateway("MPESA")}
                        className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                          selectedGateway === "MPESA"
                            ? "bg-emerald-600 text-white shadow-md"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                        <span>M-Pesa</span>
                      </button>
                    )}
                    {paymentMethods?.pesapal && (
                      <button
                        type="button"
                        onClick={() => setSelectedGateway("PESAPAL")}
                        className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                          selectedGateway === "PESAPAL"
                            ? "bg-blue-600 text-white shadow-md"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        <span>Pesapal</span>
                      </button>
                    )}
                    {paymentMethods?.paystack && (
                      <button
                        type="button"
                        onClick={() => setSelectedGateway("PAYSTACK")}
                        className={`py-1.5 px-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                          selectedGateway === "PAYSTACK"
                            ? "bg-purple-600 text-white shadow-md"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        <span>Paystack</span>
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="buyPhone" className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5">
                    {selectedGateway === "MPESA" ? "M-Pesa Phone Number" : "Mobile Phone Number"}
                  </label>
                  <input
                    id="buyPhone"
                    autoFocus
                    type="tel"
                    placeholder="0712 345 678"
                    value={buyPhone}
                    onChange={(e) => setBuyPhone(e.target.value)}
                    style={{ color: "#ffffff", backgroundColor: "#020617" }}
                    className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white font-mono text-base outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 placeholder:text-slate-500 shadow-inner"
                    required
                  />
                  <p className="text-[10.5px] text-slate-400 mt-1.5 font-medium">
                    {selectedGateway === "MPESA"
                      ? "You will receive an STK Push on this phone to enter your PIN."
                      : selectedGateway === "PESAPAL"
                      ? "Pay via M-Pesa, Airtel Money, Visa, or Mastercard on Pesapal."
                      : "We'll send your voucher code to this number."}
                  </p>
                </div>

                {(selectedGateway === "PAYSTACK" || selectedGateway === "PESAPAL") && (
                  <div>
                    <label htmlFor="buyEmail" className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5">
                      Email Address (Optional for Pesapal)
                    </label>
                    <input
                      id="buyEmail"
                      type="email"
                      placeholder="you@example.com"
                      value={buyEmail}
                      onChange={(e) => setBuyEmail(e.target.value)}
                      style={{ color: "#ffffff", backgroundColor: "#020617" }}
                      className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-500 shadow-inner"
                      required={selectedGateway === "PAYSTACK"}
                    />
                    <p className="text-[10.5px] text-slate-400 mt-1.5 font-medium">
                      Used to send your digital receipt and transaction confirmation.
                    </p>
                  </div>
                )}

                {error && <ErrorText>{error}</ErrorText>}

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 py-2 text-xs"
                    onClick={() => setSelectedPkg(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      initiatePurchase.isPending ||
                      !buyPhone ||
                      (selectedGateway === "PAYSTACK" && !buyEmail.trim())
                    }
                    className={`flex-1 py-2 text-xs font-black text-white shadow-lg ${
                      selectedGateway === "PESAPAL"
                        ? "bg-blue-600 hover:bg-blue-700"
                        : selectedGateway === "PAYSTACK"
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {initiatePurchase.isPending
                      ? "Processing..."
                      : selectedGateway === "PESAPAL"
                      ? "Pay via Pesapal"
                      : selectedGateway === "PAYSTACK"
                      ? "Pay via Paystack"
                      : "Pay with M-Pesa"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* SHARED MODAL 2: VOUCHER CODE LOGIN */}
      {showVoucherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-purple-500/40 p-6 text-slate-100 shadow-2xl">
            <h3 className="text-lg font-black text-white text-center mb-1">Enter Voucher Code</h3>
            <p className="text-xs text-slate-400 text-center mb-4">
              Type the code from your printed scratch card or receipt.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                connectWithVoucher.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <input
                  autoFocus
                  placeholder="e.g. 9PMLTXCY"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  style={{ color: "#fef08a", backgroundColor: "#020617" }}
                  className="w-full rounded-xl border-2 border-purple-500/60 bg-slate-950 px-3.5 py-3 text-center font-mono text-xl font-black tracking-widest uppercase text-amber-300 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-600 shadow-inner"
                  required
                />
              </div>

              {error && <ErrorText>{error}</ErrorText>}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 py-2 text-xs"
                  onClick={() => setShowVoucherModal(false)}
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  disabled={connectWithVoucher.isPending || !voucherCode}
                  className="flex-1 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {connectWithVoucher.isPending ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARED MODAL 3: SUBSCRIBER ACCOUNT LOGIN */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-blue-500/40 p-6 text-slate-100 shadow-2xl">
            <h3 className="text-lg font-black text-white text-center mb-1">Subscriber Account Login</h3>
            <p className="text-xs text-slate-400 text-center mb-4">
              Sign in with your ISP account credentials to access hotspot WiFi.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                connectWithAccount.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label htmlFor="accountPhone" className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5">
                  Phone Number
                </label>
                <input
                  id="accountPhone"
                  autoFocus
                  placeholder="0712 345 678"
                  value={accountPhone}
                  onChange={(e) => setAccountPhone(e.target.value)}
                  style={{ color: "#ffffff", backgroundColor: "#020617" }}
                  className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-500 shadow-inner"
                  required
                />
              </div>

              <div>
                <label htmlFor="accountPassword" className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  id="accountPassword"
                  type="password"
                  placeholder="Your account password"
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  style={{ color: "#ffffff", backgroundColor: "#020617" }}
                  className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-500 shadow-inner"
                  required
                />
              </div>

              {error && <ErrorText>{error}</ErrorText>}

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 py-2 text-xs"
                  onClick={() => setShowAccountModal(false)}
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  disabled={connectWithAccount.isPending || !accountPhone || !accountPassword}
                  className="flex-1 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {connectWithAccount.isPending ? "Signing in..." : "Sign In & Connect"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARED MODAL 4: PAY FOR TV / SMART DEVICE */}
      {showTvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 text-slate-100 shadow-2xl text-center">
            <div className="text-3xl mb-2">📺</div>
            <h3 className="text-lg font-black text-white">Connect Smart TV / Console</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              To connect a Smart TV or console that cannot open a browser, buy a package on your phone and enter the TV&apos;s MAC address or use your voucher code directly.
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                className="w-full py-2 text-xs"
                onClick={() => setShowTvModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SHARED MODAL 5: CONTACT SUPPORT */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 text-slate-100 shadow-2xl">
            {supportSent ? (
              <div className="text-center py-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-slate-950 text-2xl font-black mb-2">
                  ✓
                </div>
                <h3 className="text-lg font-black text-white">Message Sent</h3>
                <p className="text-xs text-slate-300 mt-1">
                  Our support team will get back to you shortly.
                </p>
                <Button
                  variant="secondary"
                  className="w-full py-2 text-xs mt-4"
                  onClick={() => setShowSupportModal(false)}
                >
                  Close
                </Button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-black text-white text-center mb-1">Contact Support</h3>
                <p className="text-xs text-slate-400 text-center mb-4">
                  Having an issue? Tell us what&apos;s wrong and we&apos;ll follow up.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    submitSupportTicket.mutate();
                  }}
                  className="space-y-3"
                >
                  <div>
                    <Label htmlFor="supportName">Your Name</Label>
                    <Input
                      id="supportName"
                      value={supportName}
                      onChange={(e) => setSupportName(e.target.value)}
                      style={{ color: "#ffffff", backgroundColor: "#020617" }}
                      className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white text-sm outline-none focus:border-brand-400"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="supportPhone">Phone Number (optional)</Label>
                    <Input
                      id="supportPhone"
                      placeholder="0712 345 678"
                      value={supportPhone}
                      onChange={(e) => setSupportPhone(e.target.value)}
                      style={{ color: "#ffffff", backgroundColor: "#020617" }}
                      className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white text-sm outline-none focus:border-brand-400"
                    />
                  </div>
                  <div>
                    <Label htmlFor="supportMessage">What&apos;s the issue?</Label>
                    <textarea
                      id="supportMessage"
                      value={supportMessage}
                      onChange={(e) => setSupportMessage(e.target.value)}
                      rows={3}
                      style={{ color: "#ffffff", backgroundColor: "#020617" }}
                      className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white text-sm outline-none focus:border-brand-400"
                      required
                    />
                  </div>

                  {error && <ErrorText>{error}</ErrorText>}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 py-2 text-xs"
                      onClick={() => setShowSupportModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitSupportTicket.isPending}
                      className="flex-1 py-2 text-xs font-bold"
                    >
                      {submitSupportTicket.isPending ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </CaptivePortalPluginContainer>
  );
}
