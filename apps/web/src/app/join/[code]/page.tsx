"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiRequestError, setAccessToken } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

/**
 * Where a member invite leads: someone added to a family or business account chooses their own
 * email and password, then lands in the app on that account.
 */

interface Invite {
  isp: string;
  tenantSlug: string;
  name: string;
  holder: string;
  canPay: boolean;
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { refresh } = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Invite>(`/api/v1/join/${code}`)
      .then(setInvite)
      .catch(() => setInvalid(true));
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ accessToken: string }>(`/api/v1/join/${code}`, { method: "POST", body: JSON.stringify({ email, password }) });
      setAccessToken(res.accessToken);
      await refresh().catch(() => null);
      router.replace("/app");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-sky-600";

  return (
    <main className="theme-native min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        {!invite && !invalid && <p className="text-center text-sm text-slate-500">Loading…</p>}

        {invalid && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold">This invite is not valid</h1>
            <p className="mt-2 text-sm text-slate-600">It may have expired or already been used. Ask the account holder to send you a new invite, or sign in if you already set up your login.</p>
            <Link href="/login?next=/app" className="mt-4 inline-block rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white">
              Sign in
            </Link>
          </div>
        )}

        {invite && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{invite.isp}</p>
            <h1 className="mt-1 text-2xl font-bold">Hi {invite.name.split(/\s+/)[0]}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {invite.holder} added you to their internet account. You will see the plans, bills and usage, and can ask for help
              {invite.canPay ? " and pay bills." : "."}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="j-email" className="mb-1 block text-sm font-medium">
                  Email
                </label>
                <input id="j-email" type="email" required autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="j-password" className="mb-1 block text-sm font-medium">
                  Password
                </label>
                <input id="j-password" type="password" required minLength={10} autoComplete="new-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">At least 10 characters, with a letter and a number or symbol.</p>
              </div>
              {error && <p className="text-sm text-rose-700">{error}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-lg bg-sky-700 px-4 py-3 text-base font-medium text-white disabled:opacity-60">
                {busy ? "Setting up…" : "Set up my login"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
