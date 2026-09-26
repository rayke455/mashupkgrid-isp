"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { Notice, Panel, Pill, darkButton } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";
import { AuthenticatorQr, RecoveryCodes } from "@/components/auth/two-step";

/**
 * A signed-in user's two-step sign-in: turn it on (authenticator app or SMS), see how many
 * recovery codes are left, make new ones, or turn it off. For an ISP owner, also the switch that
 * requires it for every staff member.
 */

interface Status {
  method: "TOTP" | "SMS" | null;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  required: boolean;
  smsAvailable: boolean;
  phoneHint: string | null;
}

const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : tr("Something went wrong."));

export function TwoStepSettings() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ["mfa"], queryFn: () => apiFetch<Status>("/api/v1/auth/mfa") });
  const [setup, setSetup] = useState<{ method: "TOTP" | "SMS"; secret?: string; otpauthUrl?: string; phoneHint?: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["mfa"] });

  const start = useMutation({
    mutationFn: (method: "TOTP" | "SMS") => apiFetch<typeof setup>("/api/v1/auth/mfa/start", { method: "POST", body: JSON.stringify({ method }) }),
    onSuccess: (r) => {
      setError(null);
      setSetup(r);
    },
    onError: (e) => setError(errorText(e)),
  });
  const enable = useMutation({
    mutationFn: () => apiFetch<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) }),
    onSuccess: (r) => {
      setError(null);
      setSetup(null);
      setCode("");
      setCodes(r.recoveryCodes);
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });
  const disable = useMutation({
    mutationFn: () => apiFetch("/api/v1/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => {
      setError(null);
      setPassword("");
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });
  const regenerate = useMutation({
    mutationFn: () => apiFetch<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/recovery-codes", { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: (r) => {
      setError(null);
      setPassword("");
      setCodes(r.recoveryCodes);
      refresh();
    },
    onError: (e) => setError(errorText(e)),
  });

  function submitCode(e: FormEvent) {
    e.preventDefault();
    enable.mutate();
  }

  if (!status) return null;
  const on = Boolean(status.method);

  return (
    <Panel
      title={tr("Two-step sign-in")}
      description={tr("After your password, you also give a code from your phone, so a stolen password alone can't get into your account.")}
      actions={<Pill tone={on ? "good" : "warn"}>{on ? (status.method === "TOTP" ? tr("On: authenticator app") : tr("On: SMS")) : tr("Off")}</Pill>}
    >
      <div className="space-y-4 text-sm text-slate-300">
        {error && <Notice tone="bad">{error}</Notice>}
        {status.required && !on && <Notice tone="warn">{tr("Your ISP requires two-step sign-in for staff. Set it up now, or you'll be asked to at your next sign-in.")}</Notice>}

        {codes && (
          <div className="rounded-xl bg-white p-4 text-slate-900">
            <RecoveryCodes codes={codes} />
            <button type="button" className={`${darkButton("secondary", "sm")} mt-3`} onClick={() => setCodes(null)}>
              {tr("I've saved them")}
            </button>
          </div>
        )}

        {!on && !setup && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={darkButton("primary")} disabled={start.isPending} onClick={() => start.mutate("TOTP")}>
              {tr("Use an authenticator app")}
            </button>
            {status.smsAvailable && (
              <button type="button" className={darkButton("secondary")} disabled={start.isPending} onClick={() => start.mutate("SMS")}>
                {`${tr("Get codes by SMS to")} ${status.phoneHint ?? ""}`}
              </button>
            )}
          </div>
        )}

        {setup && (
          <form onSubmit={submitCode} className="space-y-3">
            {setup.method === "TOTP" ? (
              <div className="rounded-xl bg-white p-4">
                <AuthenticatorQr secret={setup.secret!} url={setup.otpauthUrl!} />
              </div>
            ) : (
              <p>{`${tr("We sent a 6-digit code to your phone ending")} ${setup.phoneHint ?? ""}.`}</p>
            )}
            <div className="max-w-xs">
              <Label htmlFor="mfa-code">{tr("Code")}</Label>
              <Input id="mfa-code" required inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className={darkButton("primary")} disabled={enable.isPending || code.trim().length < 6}>
                {tr("Turn on")}
              </button>
              <button type="button" className={darkButton("ghost")} onClick={() => setSetup(null)}>
                {tr("Cancel")}
              </button>
            </div>
          </form>
        )}

        {on && (
          <>
            <p>
              {tr("Recovery codes left:")} <strong className="text-white">{status.recoveryCodesLeft}</strong>
              {status.recoveryCodesLeft <= 3 && ` · ${tr("Make new ones soon.")}`}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-60">
                <Label htmlFor="mfa-pw">{tr("Your password")}</Label>
                <Input id="mfa-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="button" className={darkButton("secondary")} disabled={!password || regenerate.isPending} onClick={() => regenerate.mutate()}>
                {tr("New recovery codes")}
              </button>
              {!status.required && (
                <button type="button" className={darkButton("ghost")} disabled={!password || disable.isPending} onClick={() => confirm(tr("Turn off two-step sign-in?")) && disable.mutate()}>
                  {tr("Turn off")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/** Owner switch: every staff member must use two-step sign-in. */
export function RequireStaffTwoStep() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = Boolean(user?.tenantId) && (user?.permissions.includes("settings.manage") ?? false);
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<{ security: { requireStaffMfa: boolean } } & Record<string, unknown>>("/api/v1/settings/preferences"), enabled: canManage });
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    if (data && value === null) setValue(data.security.requireStaffMfa);
  }, [data, value]);
  const save = useMutation({
    mutationFn: (v: boolean) => apiFetch("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify({ ...data, security: { requireStaffMfa: v } }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["preferences"] });
      void qc.invalidateQueries({ queryKey: ["mfa"] });
    },
  });
  if (!canManage || value === null) return null;
  return (
    <Panel title={tr("Staff sign-in rules")}>
      <label className="flex items-start gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-brand-600"
          checked={value}
          disabled={save.isPending}
          onChange={(e) => {
            setValue(e.target.checked);
            save.mutate(e.target.checked);
          }}
        />
        <span>
          {tr("Require two-step sign-in for all staff")}
          <span className="block text-xs text-slate-400">{tr("Staff who haven't set it up are asked to at their next sign-in, before they can get in. Customers and agents aren't affected.")}</span>
        </span>
      </label>
    </Panel>
  );
}
