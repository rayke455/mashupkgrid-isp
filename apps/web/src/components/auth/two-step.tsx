"use client";

import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth, type SecondStep } from "@/lib/auth-context";

/**
 * The second step of signing in: a code from the authenticator app, an SMS, or a recovery code.
 * For staff whose ISP requires two-step login and who haven't set it up, it walks them through
 * setting it up first. Styled for the (light) sign-in page.
 */

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-lg tracking-widest text-slate-900 outline-none focus:border-blue-600";
const primary = "w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60";
const link = "text-sm font-medium text-blue-700 hover:underline disabled:opacity-60";

const message = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);

export function TwoStepSignIn({ step, onDone, onCancel }: { step: SecondStep; onDone: () => void; onCancel: () => void }) {
  return "mfaRequired" in step ? <EnterCode step={step} onDone={onDone} onCancel={onCancel} /> : <SetUpAtSignIn step={step} onDone={onDone} onCancel={onCancel} />;
}

function EnterCode({ step, onDone, onCancel }: { step: Extract<SecondStep, { mfaRequired: true }>; onDone: () => void; onCancel: () => void }) {
  const { completeSignIn } = useAuth();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string; usedRecoveryCode: boolean; recoveryCodesLeft: number }>("/api/v1/auth/mfa/verify", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ challengeToken: step.challengeToken, code }),
      });
      await completeSignIn(res.accessToken);
      onDone();
    } catch (err) {
      setError(message(err, "That code didn't work. Please try again."));
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await apiFetch("/api/v1/auth/mfa/resend", { method: "POST", skipAuth: true, body: JSON.stringify({ challengeToken: step.challengeToken }) });
      setNote("A new code is on its way.");
    } catch (err) {
      setError(message(err, "Couldn't send a new code."));
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Two-step sign-in</h2>
        <p className="mt-1 text-sm text-slate-600">
          {useRecovery
            ? "Enter one of the recovery codes you saved when you set up two-step sign-in. Each works once."
            : step.method === "SMS"
              ? `Enter the 6-digit code we sent by SMS to your phone ending ${step.phoneHint ?? ""}.`
              : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>
      <input
        aria-label={useRecovery ? "Recovery code" : "Code"}
        autoFocus
        required
        autoComplete="one-time-code"
        inputMode={useRecovery ? "text" : "numeric"}
        placeholder={useRecovery ? "xxxx-xxxx" : "123456"}
        className={input}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {note && <p className="text-sm text-emerald-700">{note}</p>}
      <button type="submit" className={primary} disabled={busy || code.trim().length < 6}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" className={link} onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}>
          {useRecovery ? "Use a code instead" : "Use a recovery code"}
        </button>
        {step.method === "SMS" && !useRecovery && (
          <button type="button" className={link} onClick={resend}>
            Send a new code
          </button>
        )}
        <button type="button" className={link} onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}

function SetUpAtSignIn({ step, onDone, onCancel }: { step: Extract<SecondStep, { mfaSetupRequired: true }>; onDone: () => void; onCancel: () => void }) {
  const { completeSignIn } = useAuth();
  const [started, setStarted] = useState<{ method: "TOTP" | "SMS"; secret?: string; otpauthUrl?: string; phoneHint?: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ codes: string[]; accessToken: string } | null>(null);

  async function start(method: "TOTP" | "SMS") {
    setBusy(true);
    setError(null);
    try {
      setStarted(await apiFetch("/api/v1/auth/mfa/setup/start", { method: "POST", skipAuth: true, body: JSON.stringify({ setupToken: step.setupToken, method }) }));
    } catch (err) {
      setError(message(err, "Couldn't start setup."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string; recoveryCodes: string[] }>("/api/v1/auth/mfa/setup/confirm", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ setupToken: step.setupToken, code }),
      });
      setRecovery({ codes: res.recoveryCodes, accessToken: res.accessToken });
    } catch (err) {
      setError(message(err, "That code didn't work. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <div className="mt-8 space-y-5">
        <h2 className="text-xl font-semibold">Save your recovery codes</h2>
        <RecoveryCodes codes={recovery.codes} />
        <button
          type="button"
          className={primary}
          onClick={async () => {
            await completeSignIn(recovery.accessToken);
            onDone();
          }}
        >
          I&apos;ve saved them, continue
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Set up two-step sign-in</h2>
        <p className="mt-1 text-sm text-slate-600">Your ISP asks all staff to use two-step sign-in. After your password, you&apos;ll also give a code from your phone. It takes a minute.</p>
      </div>
      {!started ? (
        <div className="space-y-3">
          <button type="button" className={primary} disabled={busy} onClick={() => start("TOTP")}>
            Use an authenticator app (recommended)
          </button>
          {step.smsAvailable && (
            <button type="button" className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60" disabled={busy} onClick={() => start("SMS")}>
              Get codes by SMS
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          {started.method === "TOTP" ? (
            <AuthenticatorQr secret={started.secret!} url={started.otpauthUrl!} />
          ) : (
            <p className="text-sm text-slate-700">We sent a 6-digit code to your phone ending {started.phoneHint}.</p>
          )}
          <input aria-label="Code" autoFocus required inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={input} value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="submit" className={primary} disabled={busy || code.trim().length < 6}>
            {busy ? "Checking…" : "Turn on and sign in"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button type="button" className={link} onClick={onCancel}>
        Back
      </button>
    </div>
  );
}

/** The QR to scan, with the key to type in for apps that can't scan. */
export function AuthenticatorQr({ secret, url }: { secret: string; url: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [url]);
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>Scan this with Google Authenticator, Microsoft Authenticator or a similar app, then enter the 6-digit code it shows.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-1" />}
      <p>
        Can&apos;t scan? Enter this key: <span className="break-all font-mono font-semibold text-slate-900">{secret.match(/.{1,4}/g)?.join(" ")}</span>
      </p>
    </div>
  );
}

/** Recovery codes, shown once, with copy and download. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe: they won&apos;t be shown again.</p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-slate-900">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-3">
        <button type="button" className={link} onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => undefined)}>
          {copied ? "Copied" : "Copy"}
        </button>
        <a className={link} href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="recovery-codes.txt">
          Download
        </a>
      </div>
    </div>
  );
}
