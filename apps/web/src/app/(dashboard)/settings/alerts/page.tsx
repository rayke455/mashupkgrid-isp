"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { Button, Card, ErrorText, HintText, Input, Label } from "@/components/ui";

/**
 * Push alerts on this phone or computer: a router going down, or a large payment arriving. Each
 * person turns them on for their own devices; the ISP's owner sets the payment amount and whether
 * router alerts go out at all.
 */

interface PushConfig {
  configured: boolean;
  publicKey: string | null;
  devices: number;
}

interface Preferences {
  alerts: { routerDown: boolean; largePaymentMinor: number };
  [key: string]: unknown;
}

type DeviceState = "checking" | "unsupported" | "install-first" | "denied" | "off" | "on";

const SW_URL = "/push-sw.js";

function base64UrlToBytes(value: string): Uint8Array {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  return registration ? registration.pushManager.getSubscription() : null;
}

const S = {
  en: {
    title: "Alerts on this device",
    intro: "Get an alert on this phone or computer when a router goes down or a large payment arrives, even when the dashboard is closed.",
    device: "This device",
    notSetUp: "Push alerts are not set up on this server yet. The platform administrator needs to add the VAPID keys.",
    unsupported: "This browser cannot receive push alerts. Use Chrome, Edge or Firefox, or Safari on a recent iPhone.",
    installFirst: "On iPhone and iPad, add this dashboard to your home screen first (Share, then Add to Home Screen), open it from there, and come back to this page.",
    denied: "Alerts are blocked for this site in your browser settings. Allow notifications for this site, then reload.",
    on: "Alerts are on for this device.",
    off: "Alerts are off for this device.",
    turnOn: "Turn on alerts",
    turnOff: "Turn off",
    test: "Send a test alert",
    testSent: (n: number) => (n > 0 ? `Test sent to ${n} device${n === 1 ? "" : "s"}.` : "No device accepted the test. Turn alerts off and on again."),
    otherDevices: (n: number) => `${n} of your devices ${n === 1 ? "has" : "have"} alerts on.`,
    whoGets: "Who gets which alert",
    whoRouter: "Router down and back online: staff who can manage routers.",
    whoPayment: "Large payment: staff who can see payments.",
    isp: "Alerts for the whole ISP",
    routerToggle: "Send router down alerts",
    amount: "Alert on payments of at least (KES)",
    amountHint: "0 turns payment alerts off. The smallest amount is 100.",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    working: "Working…",
  },
  sw: {
    title: "Arifa kwenye kifaa hiki",
    intro: "Pata arifa kwenye simu au kompyuta hii ruta ikizimika au malipo makubwa yakiingia, hata dashibodi ikiwa imefungwa.",
    device: "Kifaa hiki",
    notSetUp: "Arifa bado hazijawekwa kwenye seva hii. Msimamizi wa jukwaa anahitaji kuongeza funguo za VAPID.",
    unsupported: "Kivinjari hiki hakiwezi kupokea arifa. Tumia Chrome, Edge au Firefox, au Safari kwenye iPhone mpya.",
    installFirst: "Kwenye iPhone na iPad, kwanza ongeza dashibodi hii kwenye skrini ya mwanzo (Shiriki, kisha Ongeza kwenye Skrini ya Mwanzo), ifungue kutoka hapo, kisha urudi kwenye ukurasa huu.",
    denied: "Arifa zimezuiwa kwa tovuti hii kwenye mipangilio ya kivinjari. Ruhusu arifa kwa tovuti hii, kisha pakia upya.",
    on: "Arifa zimewashwa kwa kifaa hiki.",
    off: "Arifa zimezimwa kwa kifaa hiki.",
    turnOn: "Washa arifa",
    turnOff: "Zima",
    test: "Tuma arifa ya majaribio",
    testSent: (n: number) => (n > 0 ? `Jaribio limetumwa kwa vifaa ${n}.` : "Hakuna kifaa kilichopokea jaribio. Zima arifa kisha uziwashe tena."),
    otherDevices: (n: number) => `Vifaa vyako ${n} vina arifa zimewashwa.`,
    whoGets: "Nani anapata arifa gani",
    whoRouter: "Ruta kuzimika na kurudi: wafanyakazi wanaoweza kusimamia ruta.",
    whoPayment: "Malipo makubwa: wafanyakazi wanaoweza kuona malipo.",
    isp: "Arifa kwa mtoa huduma mzima",
    routerToggle: "Tuma arifa ruta ikizimika",
    amount: "Arifa kwa malipo ya angalau (KES)",
    amountHint: "0 huzima arifa za malipo. Kiasi cha chini ni 100.",
    save: "Hifadhi",
    saving: "Inahifadhi…",
    saved: "Imehifadhiwa",
    working: "Inashughulikia…",
  },
};

export default function AlertsSettingsPage() {
  const { lang } = useLanguage();
  const t = S[lang];
  const { user } = useAuth();
  const canManage = user?.permissions.includes("settings.manage") ?? false;
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["push-config"], queryFn: () => apiFetch<PushConfig>("/api/v1/push/config") });
  const [state, setState] = useState<DeviceState>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isInstalled() ? "install-first" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      setState((await currentSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const refreshConfig = () => queryClient.invalidateQueries({ queryKey: ["push-config"] });

  async function turnOn() {
    if (!config?.publicKey) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(config.publicKey) as BufferSource }));
      await apiFetch("/api/v1/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setState("on");
      refreshConfig();
    } catch (err) {
      setError(err instanceof ApiRequestError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await apiFetch("/api/v1/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setState("off");
      refreshConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const test = useMutation({
    mutationFn: () => apiFetch<{ sent: number }>("/api/v1/push/test", { method: "POST", body: "{}" }),
    onSuccess: (r) => setMessage(t.testSent(r.sent)),
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const statusText =
    config && !config.configured
      ? t.notSetUp
      : state === "unsupported"
      ? t.unsupported
      : state === "install-first"
      ? t.installFirst
      : state === "denied"
      ? t.denied
      : state === "on"
      ? t.on
      : state === "off"
      ? t.off
      : "…";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.intro}</p>
      </div>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t.device}</h2>
          <p className={`mt-1 text-sm ${state === "on" && config?.configured ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"}`}>{statusText}</p>
        </div>
        {config?.configured && (state === "on" || state === "off") && (
          <div className="flex flex-wrap gap-2">
            {state === "off" ? (
              <Button onClick={turnOn} disabled={busy}>
                {busy ? t.working : t.turnOn}
              </Button>
            ) : (
              <>
                <Button onClick={() => test.mutate()} disabled={test.isPending}>
                  {test.isPending ? t.working : t.test}
                </Button>
                <Button variant="outline" onClick={turnOff} disabled={busy}>
                  {t.turnOff}
                </Button>
              </>
            )}
          </div>
        )}
        {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
        {error && <ErrorText>{error}</ErrorText>}
        {config && config.devices > 0 && <HintText>{t.otherDevices(config.devices)}</HintText>}
        <div className="border-t border-slate-200 pt-4 dark:border-obsidian-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t.whoGets}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>{t.whoRouter}</li>
            <li>{t.whoPayment}</li>
          </ul>
        </div>
      </Card>

      {canManage && <IspAlertSettings t={t} />}
    </div>
  );
}

function IspAlertSettings({ t }: { t: (typeof S)["en"] | (typeof S)["sw"] }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [routerDown, setRouterDown] = useState(true);
  const [amount, setAmount] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setRouterDown(data.alerts.routerDown);
      setAmount(String(data.alerts.largePaymentMinor / 100));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<Preferences>("/api/v1/settings/preferences", {
        method: "PUT",
        body: JSON.stringify({ ...data, alerts: { routerDown, largePaymentMinor: Math.round(Number(amount || 0) * 100) } }),
      }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  if (!data) return null;
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t.isp}</h2>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={routerDown} onChange={(e) => setRouterDown(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          {t.routerToggle}
        </label>
        <div className="max-w-xs">
          <Label htmlFor="alertAmount">{t.amount}</Label>
          <Input id="alertAmount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          <HintText>{t.amountHint}</HintText>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t.saving : t.save}
          </Button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.saved}</span>}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </form>
    </Card>
  );
}
