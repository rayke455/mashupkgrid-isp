"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  Alert,
  Dialog,
  EnvironmentBadge,
  Field,
  Money,
  PLATFORM_TABS,
  Panel,
  PaymentsWorkspace,
  StatusBadge,
  TableShell,
  buttonClass,
  inputClass,
  td,
  th,
} from "@/components/payments-gateway/kit";
import { usePlatformGateway, usePlatformTenants } from "@/components/payments-gateway/use-platform";
import type { PlatformTenantRow } from "@/components/payments-gateway/types";

/** Write-only secret input: shows whether a value is stored, never the value. */
function SecretField({ id, label, saved, value, onChange, hint }: { id: string; label: string; saved: boolean; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Field label={label} htmlFor={id} hint={saved ? "Saved — leave blank to keep the current value." : hint}>
      <input
        id={id}
        type="password"
        autoComplete="new-password"
        className={inputClass}
        placeholder={saved ? "•••••••• (saved)" : "Not set"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export default function PlatformGatewayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const gateway = usePlatformGateway();
  const tenants = usePlatformTenants();
  const canManage = Boolean(user?.permissions.includes("platform_payments.manage"));
  const g = gateway.data;

  const [form, setForm] = useState({
    shortcode: "",
    environment: "sandbox",
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
    initiatorName: "",
    initiatorCredential: "",
    b2cShortcode: "",
    b2cInitiatorName: "",
    b2cInitiatorCredential: "",
  });
  const [saved, setSaved] = useState(false);
  const [toggle, setToggle] = useState<null | boolean>(null);
  const [modeChange, setModeChange] = useState<PlatformTenantRow | null>(null);

  useEffect(() => {
    if (!g) return;
    setForm((f) => ({
      ...f,
      shortcode: g.collection.shortcode ?? "",
      environment: g.collection.environment === "production" ? "production" : "sandbox",
      initiatorName: g.b2b.initiatorName ?? "",
      b2cShortcode: g.b2c.shortcode ?? "",
      b2cInitiatorName: g.b2c.initiatorName ?? "",
    }));
  }, [g]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/v1/platform/payments/gateway", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      setSaved(true);
      setForm((f) => ({ ...f, consumerKey: "", consumerSecret: "", passkey: "", initiatorCredential: "", b2cInitiatorCredential: "" }));
      void qc.invalidateQueries({ queryKey: ["platform-payments"] });
    },
  });

  const setMode = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "OWN" | "PLATFORM" }) =>
      apiFetch(`/api/v1/platform/payments/tenants/${id}/collection-mode`, { method: "PUT", body: JSON.stringify({ collectionMode: mode }) }),
    onSuccess: () => {
      setModeChange(null);
      void qc.invalidateQueries({ queryKey: ["platform-payments"] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const body: Record<string, unknown> = {
      shortcode: form.shortcode || undefined,
      environment: form.environment,
      initiatorName: form.initiatorName,
      b2cShortcode: form.b2cShortcode,
      b2cInitiatorName: form.b2cInitiatorName,
    };
    for (const k of ["consumerKey", "consumerSecret", "passkey", "initiatorCredential", "b2cInitiatorCredential"] as const) {
      if (form[k].trim()) body[k] = form[k].trim();
    }
    save.mutate(body);
  };

  return (
    <PaymentsWorkspace
      tabs={PLATFORM_TABS}
      title="Payment Gateway"
      description="The MashupHost paybill that collects for ISPs without a gateway of their own, and the credentials that pay them out. Secrets are stored encrypted and are never shown again after saving."
    >
      {gateway.error && <Alert title="Couldn't load the gateway">{(gateway.error as Error).message}</Alert>}

      <Panel title="Gateway status">
        {!g ? (
          <div className="h-16 animate-pulse rounded-md bg-slate-100" />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {g.gatewayEnabled ? <StatusBadge status="SETTLED" label="Active" /> : <StatusBadge status="CANCELLED" label="Disabled" />}
                <EnvironmentBadge environment={g.collection.environment === "production" ? "PRODUCTION" : "SANDBOX"} />
              </div>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                {g.gatewayEnabled
                  ? "ISPs connected to the gateway can take payments through the MashupHost paybill."
                  : "New platform collections are refused. Payments already made are still recorded and settled."}
              </p>
            </div>
            {canManage && (
              <button type="button" className={buttonClass(g.gatewayEnabled ? "secondary" : "primary")} onClick={() => setToggle(!g.gatewayEnabled)}>
                {g.gatewayEnabled ? "Disable gateway" : "Enable gateway"}
              </button>
            )}
          </div>
        )}
        {g && (
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Check ok={g.collection.configured} label="Collection credentials" />
            <Check ok={g.b2b.configured} label="B2B payouts (till / paybill)" />
            <Check ok={g.b2c.configured} label="B2C payouts (M-Pesa phone)" />
            <Check ok={g.callbackTokenConfigured} label="Callback token set" />
          </ul>
        )}
        {g?.sandboxSettlements && (
          <div className="mt-4">
            <Alert tone="amber" title="Sandbox settlements are on">
              PAYMENTS_SANDBOX_SETTLEMENTS=true — settlements are simulated, not sent to M-Pesa. This cannot be enabled in production.
            </Alert>
          </div>
        )}
      </Panel>

      <form onSubmit={submit} className="space-y-6" noValidate>
        <Panel title="Collection" description="Provider: M-Pesa (Safaricom Daraja). Used for STK push and the platform paybill.">
          <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
            <Field label="Paybill / business shortcode" htmlFor="gw-shortcode">
              <input id="gw-shortcode" inputMode="numeric" className={inputClass} value={form.shortcode} onChange={(e) => set("shortcode")(e.target.value)} />
            </Field>
            <Field label="Environment" htmlFor="gw-env" hint="Production moves real money.">
              <select id="gw-env" className={inputClass} value={form.environment} onChange={(e) => set("environment")(e.target.value)}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </Field>
            <SecretField id="gw-ck" label="Consumer key" saved={Boolean(g?.collection.configured)} value={form.consumerKey} onChange={set("consumerKey")} />
            <SecretField id="gw-cs" label="Consumer secret" saved={Boolean(g?.collection.configured)} value={form.consumerSecret} onChange={set("consumerSecret")} />
            <SecretField id="gw-pk" label="Passkey (Lipa na M-Pesa Online)" saved={Boolean(g?.collection.configured)} value={form.passkey} onChange={set("passkey")} />
          </fieldset>
        </Panel>

        <Panel title="Settlement payouts" description="Safaricom approves B2B and B2C separately; configure whichever you have.">
          <fieldset disabled={!canManage} className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">B2B — to a till or paybill</h3>
              <Field label="Initiator name" htmlFor="gw-b2b-init">
                <input id="gw-b2b-init" className={inputClass} value={form.initiatorName} onChange={(e) => set("initiatorName")(e.target.value)} />
              </Field>
              <SecretField
                id="gw-b2b-cred"
                label="Security credential"
                saved={Boolean(g?.b2b.configured)}
                value={form.initiatorCredential}
                onChange={set("initiatorCredential")}
                hint="The initiator password encrypted with Safaricom's certificate."
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">B2C — to an M-Pesa phone</h3>
              <Field label="B2C shortcode" htmlFor="gw-b2c-sc">
                <input id="gw-b2c-sc" inputMode="numeric" className={inputClass} value={form.b2cShortcode} onChange={(e) => set("b2cShortcode")(e.target.value)} />
              </Field>
              <Field label="Initiator name" htmlFor="gw-b2c-init">
                <input id="gw-b2c-init" className={inputClass} value={form.b2cInitiatorName} onChange={(e) => set("b2cInitiatorName")(e.target.value)} />
              </Field>
              <SecretField id="gw-b2c-cred" label="Security credential" saved={Boolean(g?.b2c.configured)} value={form.b2cInitiatorCredential} onChange={set("b2cInitiatorCredential")} />
            </div>
          </fieldset>
        </Panel>

        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={buttonClass("primary")} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save gateway settings"}
            </button>
            {saved && !save.isPending && <span className="text-sm text-emerald-700">Saved. Secrets were encrypted and cleared from this form.</span>}
          </div>
        )}
        {save.error && <Alert title="Couldn't save">{(save.error as ApiRequestError).message}</Alert>}
      </form>

      {g && (
        <Panel title="Callback URLs" description="Register these with Safaricom. The token is masked here; use the MPESA_CALLBACK_TOKEN value configured on the server.">
          <dl className="space-y-3 text-sm">
            {[
              ["STK push callback", g.callbackUrls.stk],
              ["Paybill validation (C2B)", g.callbackUrls.c2bValidation],
              ["Paybill confirmation (C2B)", g.callbackUrls.c2bConfirmation],
              ["Settlement result (B2B / B2C)", g.callbackUrls.settlementResult],
              ["Settlement queue timeout", g.callbackUrls.settlementTimeout],
            ].map(([label, url]) => (
              <div key={label} className="grid gap-1 sm:grid-cols-[220px_1fr]">
                <dt className="text-slate-500">{label}</dt>
                <dd className="break-all font-mono text-xs text-slate-800">{url}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}

      <Panel title="ISPs on the gateway" description="Connecting an ISP routes its customers' M-Pesa payments through the MashupHost paybill." padded={false}>
        <TableShell minWidth={680}>
          <thead>
            <tr>
              <th className={th}>ISP</th>
              <th className={th}>Collection</th>
              <th className={th}>Destination</th>
              <th className={`${th} text-right`}>Balance</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tenants.data?.map((t) => (
              <tr key={t.id}>
                <td className={`${td} font-medium text-slate-900`}>{t.name}</td>
                <td className={td}>{t.collectionMode === "PLATFORM" ? <StatusBadge status="SETTLED" label="MashupHost gateway" /> : <StatusBadge status="CANCELLED" label="Own paybill" />}</td>
                <td className={td}>{t.destination?.label ?? <span className="text-slate-400">—</span>}</td>
                <td className={`${td} text-right`}>
                  <Money minor={t.balance.availableMinor} />
                </td>
                <td className={`${td} text-right`}>
                  {canManage && (
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setModeChange(t)}>
                      {t.collectionMode === "PLATFORM" ? "Disconnect" : "Connect"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>

      {toggle !== null && (
        <Dialog
          open
          onClose={() => setToggle(null)}
          title={toggle ? "Enable the gateway?" : "Disable the gateway?"}
          footer={
            <>
              <button type="button" className={buttonClass("ghost")} onClick={() => setToggle(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={buttonClass(toggle ? "primary" : "danger")}
                disabled={save.isPending}
                onClick={() => save.mutateAsync({ gatewayEnabled: toggle }).then(() => setToggle(null))}
              >
                {toggle ? "Enable" : "Disable"}
              </button>
            </>
          }
        >
          <p>
            {toggle
              ? "Connected ISPs can take payments through the MashupHost paybill again."
              : "Customers of connected ISPs will be told online payment is unavailable until you enable it again. Payments already in flight are still recorded."}
          </p>
        </Dialog>
      )}
      {modeChange && (
        <Dialog
          open
          onClose={() => setModeChange(null)}
          title={modeChange.collectionMode === "PLATFORM" ? `Disconnect ${modeChange.name}?` : `Connect ${modeChange.name}?`}
          footer={
            <>
              <button type="button" className={buttonClass("ghost")} onClick={() => setModeChange(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={buttonClass("primary")}
                disabled={setMode.isPending}
                onClick={() => setMode.mutate({ id: modeChange.id, mode: modeChange.collectionMode === "PLATFORM" ? "OWN" : "PLATFORM" })}
              >
                Confirm
              </button>
            </>
          }
        >
          <p>
            {modeChange.collectionMode === "PLATFORM"
              ? "New payments will go to the ISP's own M-Pesa account. Anything the platform already holds for them stays on their balance and is still settled."
              : "New M-Pesa payments for this ISP will be collected by the MashupHost paybill and credited to their balance, less the platform fee."}
          </p>
          {setMode.error && <Alert>{(setMode.error as ApiRequestError).message}</Alert>}
        </Dialog>
      )}
    </PaymentsWorkspace>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
        {ok ? "✓" : "–"}
      </span>
      <span className={ok ? "text-slate-800" : "text-slate-500"}>
        {label}
        <span className="sr-only">{ok ? ": configured" : ": not configured"}</span>
      </span>
    </li>
  );
}
