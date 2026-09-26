"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch, ApiRequestError, setAccessToken } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

/**
 * Where the self-install card's QR code leads. The customer picks an email and password (their
 * app login, linked to their account), then gets their router's internet login and plain steps
 * to connect it. Phone-sized, and independent of the dashboard.
 */

interface CardInfo {
  isp: string;
  tenantSlug: string;
  firstName: string;
  customerNumber: string;
  hasLogin: boolean;
  suggestedEmail: string | null;
  plans: { name: string; mbps: number; pppoe: boolean }[];
}

interface Subscription {
  id: string;
  package: { name: string };
}

type Step = "loading" | "invalid" | "form" | "connect";

export default function ActivatePage() {
  const { code } = useParams<{ code: string }>();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<CardInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logins, setLogins] = useState<{ plan: string; username: string; password: string }[]>([]);

  useEffect(() => {
    apiFetch<CardInfo>(`/api/v1/activate/${code}`)
      .then((i) => {
        setInfo(i);
        setEmail(i.suggestedEmail ?? "");
        setStep("form");
      })
      .catch(() => setStep("invalid"));
  }, [code]);

  async function loadLogins() {
    const subs = await apiFetch<Subscription[]>("/api/v1/me/subscriptions").catch(() => [] as Subscription[]);
    const out: { plan: string; username: string; password: string }[] = [];
    for (const s of subs) {
      const creds = await apiFetch<{ username: string; password: string }>(`/api/v1/me/subscriptions/${s.id}/reveal-pppoe-password`, { method: "POST" }).catch(() => null);
      if (creds) out.push({ plan: s.package.name, ...creds });
    }
    setLogins(out);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ accessToken: string }>(`/api/v1/activate/${code}`, { method: "POST", body: JSON.stringify({ email, password }) });
      setAccessToken(res.accessToken);
      await refresh().catch(() => null);
      await loadLogins();
      setStep("connect");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-sky-600";

  return (
    <main className="theme-native min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md space-y-6">
        {step === "loading" && <p className="text-center text-sm text-slate-500">Loading…</p>}

        {step === "invalid" && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold">This card is not valid</h1>
            <p className="mt-2 text-sm text-slate-600">It may have expired or been replaced. Ask your internet provider for a new card, or sign in if you already have an account.</p>
            <Link href="/login?next=/app" className="mt-4 inline-block rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white">
              Sign in
            </Link>
          </div>
        )}

        {step === "form" && info && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{info.isp}</p>
            <h1 className="mt-1 text-2xl font-bold">Welcome, {info.firstName}</h1>
            <p className="text-sm text-slate-600">
              Account {info.customerNumber}
              {info.plans[0] && ` · ${info.plans[0].name}`}
            </p>
            {info.hasLogin ? (
              <div className="mt-6">
                <p className="text-sm text-slate-700">You already have an account. Sign in to see your internet login and pay your bills.</p>
                <Link href={`/login?next=/app&tenant=${encodeURIComponent(info.tenantSlug)}`} className="mt-4 inline-block rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-medium text-white">
                  Sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <p className="text-sm text-slate-700">Choose how you will sign in to your account.</p>
                <div>
                  <label htmlFor="a-email" className="mb-1 block text-sm font-medium">
                    Email
                  </label>
                  <input id="a-email" type="email" required autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="a-password" className="mb-1 block text-sm font-medium">
                    Password
                  </label>
                  <input id="a-password" type="password" required minLength={10} autoComplete="new-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="mt-1 text-xs text-slate-500">At least 10 characters, with a letter and a number or symbol.</p>
                </div>
                {error && <p className="text-sm text-rose-700">{error}</p>}
                <button type="submit" disabled={busy} className="w-full rounded-lg bg-sky-700 px-4 py-3 text-base font-medium text-white disabled:opacity-60">
                  {busy ? "Setting up…" : "Set up my account"}
                </button>
              </form>
            )}
          </div>
        )}

        {step === "connect" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h1 className="text-xl font-semibold">Your account is ready</h1>
              <p className="mt-1 text-sm text-slate-600">Now connect your router. It takes about five minutes.</p>
            </div>
            {logins.map((l) => (
              <div key={l.username} className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Internet login for {l.plan}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-slate-500">Username</dt>
                  <dd className="break-all font-mono">{l.username}</dd>
                  <dt className="text-slate-500">Password</dt>
                  <dd className="break-all font-mono">{l.password}</dd>
                </dl>
              </div>
            ))}
            <ol className="list-decimal space-y-3 rounded-2xl bg-white p-6 pl-10 text-sm leading-6 shadow-sm">
              <li>Plug the cable from the wall socket into your router&apos;s WAN (internet) port, usually a different colour.</li>
              <li>Connect your phone to the router&apos;s Wi-Fi. Its name and password are on a sticker under the router.</li>
              <li>Open the address on that sticker in your browser (often 192.168.0.1 or 192.168.1.1) and sign in with the admin password on the sticker.</li>
              <li>Find the Internet or WAN settings, choose <strong>PPPoE</strong>, and enter the username and password above.</li>
              <li>Save. The internet light turns on within a minute. If it does not, open Help in the app.</li>
            </ol>
            <Link href="/app" className="block rounded-lg bg-sky-700 px-4 py-3 text-center text-base font-medium text-white">
              Open my account
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
