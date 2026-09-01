"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconCopy, IconCheck, IconTerminal, IconChevronRight } from "@/components/icons";

type Step = 1 | 2 | 3;

interface RouterRecord {
  id: string;
  name: string;
  host: string | null;
  status: "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";
  lastError: string | null;
}

// One script does the whole job -- API user, RADIUS, hotspot server, walled garden and portal
// page all come from the single provisioning script in step 2 (buildMikrotikProvisioningScript).
// There is deliberately no separate "RADIUS" step: it used to ask for a FreeRADIUS host and hand
// out a clients.conf snippet, neither of which this platform uses -- RADIUS is the worker's own
// embedded server and the NAS row registers itself from the router's heartbeat.
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Identity" },
  { n: 2, label: "Provision" },
  { n: 3, label: "Done" },
];

function StepDots({ current }: { current: Step }) {
  return (
    <div className="mb-8 flex items-center">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                s.n < current
                  ? "border-brand-600 bg-brand-600 text-white"
                  : s.n === current
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-slate-300 text-slate-400 dark:border-obsidian-700"
              }`}
            >
              {s.n < current ? <IconCheck size={14} /> : s.n}
            </div>
            <span
              className={`text-xs font-medium ${
                s.n <= current ? "text-slate-900 dark:text-white" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-3 mb-5 h-0.5 w-16 ${s.n < current ? "bg-brand-600" : "bg-slate-200 dark:bg-obsidian-800"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function LinkRouterWizardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [created, setCreated] = useState<RouterRecord | null>(null);
  const [provisionToken, setProvisionToken] = useState<string | null>(null);
  const [provisioningScript, setProvisioningScript] = useState<string | null>(null);
  const [waitingForCallback, setWaitingForCallback] = useState(true);
  const [showManualFallback, setShowManualFallback] = useState(false);

  // Manual-entry fallback fields — only used if the router can't reach this platform to call
  // home (e.g. no outbound internet, or a private test router with no public/forwarded address).
  const [manualHost, setManualHost] = useState("");
  const [manualPort, setManualPort] = useState("8728");
  const [manualUseTls, setManualUseTls] = useState(false);
  const [manualUsername, setManualUsername] = useState("");
  const [manualPassword, setManualPassword] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [oneLiner, setOneLiner] = useState<string>("");

  const createPending = useMutation({
    mutationFn: () =>
      apiFetch<RouterRecord & { provisionToken: string }>("/api/v1/routers/pending", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (result) => {
      const { provisionToken: token, ...routerRecord } = result;
      setCreated(routerRecord);
      setProvisionToken(token);
      setStep(2);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to register router"),
  });

  const loadProvisioningScript = useMutation({
    mutationFn: () =>
      apiFetch<{ script: string; fetchCommand?: string; oneLiner?: string }>(
        `/api/v1/routers/${created!.id}/provisioning-script?provisionToken=${encodeURIComponent(provisionToken!)}`
      ),
    onSuccess: (result) => {
      setProvisioningScript(result.script);
      const cmd =
        result.oneLiner ||
        result.fetchCommand ||
        `/tool fetch url="https://api.mashuphost.tech/api/v1/routers/provision/${provisionToken}/setup.rsc" dst-path=setup.rsc; :delay 2s; /import setup.rsc;`;
      setOneLiner(cmd);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to generate provisioning script"),
  });

  useEffect(() => {
    if (step === 2 && created && provisionToken && !provisioningScript) {
      loadProvisioningScript.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, created?.id]);

  const checkLinked = useMutation({
    mutationFn: () => apiFetch<RouterRecord>(`/api/v1/routers/${created!.id}`),
    onSuccess: async (result) => {
      if (result.host) {
        // Host just appeared — the router's callback landed. Kick a real connectivity check so
        // the status badge reflects reality immediately instead of waiting for the next
        // background poll (apps/worker's poll-router-health runs on a 60s cadence).
        await apiFetch(`/api/v1/routers/${result.id}/test-connection`, { method: "POST" }).catch(() => {});
        const fresh = await apiFetch<RouterRecord>(`/api/v1/routers/${result.id}`);
        setCreated(fresh);
        setWaitingForCallback(false);
        queryClient.invalidateQueries({ queryKey: ["routers"] });
      } else {
        setCreated(result);
      }
    },
  });

  // Poll for the router's callback rather than a fixed connectivity check — until `host` is
  // populated there's nothing to dial yet (see completeRouterProvisioning in @mashupkgrid/network).
  useEffect(() => {
    if (step !== 2 || !created || created.host) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await checkLinked.mutateAsync().catch(() => {});
      if (!cancelled && waitingForCallback) setTimeout(poll, 3000);
    };
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, created?.id, waitingForCallback]);

  const linkManually = useMutation({
    mutationFn: () =>
      apiFetch<RouterRecord>(`/api/v1/routers/${created!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          host: manualHost,
          apiPort: Number(manualPort),
          useTls: manualUseTls,
          username: manualUsername,
          password: manualPassword,
        }),
      }),
    onSuccess: (result) => {
      setCreated(result);
      setWaitingForCallback(false);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to link router manually"),
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusBadge = created ? (
    <div className="flex items-center gap-2">
      <StatusDot status={created.status} pulse={created.status === "ONLINE"} />
      <Badge variant={created.status === "ONLINE" ? "success" : created.status === "DOWN" ? "danger" : "neutral"}>
        {created.status}
      </Badge>
    </div>
  ) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Network — Routers</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Link a <span className="text-brand-600 dark:text-brand-400">MikroTik</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Name it, paste one script — the router links itself. No IP, port, or password to type.
        </p>
      </div>

      <StepDots current={step} />

      {step === 1 && (
        <Card>
          <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Router identity</h2>
          <p className="mb-4 text-sm text-slate-500">A name to identify this router across the dashboard.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createPending.mutate();
            }}
          >
            <Label htmlFor="name">Router name</Label>
            <Input
              id="name"
              placeholder="e.g. Core-CCR2004-Nairobi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            {error && <ErrorText>{error}</ErrorText>}
            <div className="mt-5 flex justify-end">
              <Button type="submit" disabled={createPending.isPending} className="gap-1.5">
                {createPending.isPending ? "Registering..." : "Continue"} <IconChevronRight size={14} />
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 2 && created && (
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <IconTerminal className="text-brand-600 dark:text-brand-400" />
            <h2 className="font-semibold text-slate-900 dark:text-white">1-Line Auto Setup</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Open WinBox → New Terminal on <code className="font-mono text-xs font-bold text-brand-500">{created.name}</code>, paste this single command, and press Enter. This is the only script you need. It configures the API user, RADIUS, the hotspot captive portal server, DNS and NAT, your branded login page, and the walled garden for M-Pesa, Paystack and Pesapal &mdash; then links the router.
          </p>

          {(oneLiner || provisionToken) && (
            <div className="mb-5 p-3.5 rounded-xl bg-slate-900 border-2 border-brand-500/40 shadow-lg shadow-brand-500/10">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-brand-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  1-Line Terminal Command (Recommended)
                </span>
                <Button
                  variant="primary"
                  className="px-3 py-1 text-xs gap-1 font-bold shadow-md shadow-brand-500/20"
                  onClick={() =>
                    handleCopy(
                      oneLiner ||
                        `/tool fetch url="https://api.mashuphost.tech/api/v1/routers/provision/${provisionToken}/setup.rsc" dst-path=setup.rsc; :delay 2s; /import setup.rsc;`,
                      "oneliner"
                    )
                  }
                >
                  {copiedId === "oneliner" ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  <span>{copiedId === "oneliner" ? "Copied!" : "Copy 1-Line Command"}</span>
                </Button>
              </div>
              <div className="p-2.5 rounded-lg bg-black font-mono text-xs text-emerald-400 border border-slate-800 break-all select-all leading-relaxed">
                {oneLiner ||
                  `/tool fetch url="https://api.mashuphost.tech/api/v1/routers/provision/${provisionToken}/setup.rsc" dst-path=setup.rsc; :delay 2s; /import setup.rsc;`}
              </div>
            </div>
          )}

          {provisioningScript && (
            <details className="mb-4 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <summary className="text-xs font-medium text-slate-400 cursor-pointer hover:text-white flex items-center justify-between select-none">
                <span>View full .rsc configuration script</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Expand</span>
              </summary>
              <div className="mt-2.5 pt-2.5 border-t border-slate-800">
                <div className="mb-1.5 flex justify-end">
                  <Button
                    variant="secondary"
                    className="px-2 py-0.5 text-xs gap-1"
                    onClick={() => handleCopy(provisioningScript, "prov")}
                  >
                    {copiedId === "prov" ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    {copiedId === "prov" ? "Copied!" : "Copy full script"}
                  </Button>
                </div>
                <pre className="max-h-48 overflow-auto rounded bg-black p-2.5 font-mono text-[11px] text-slate-300 border border-slate-900">
                  {provisioningScript}
                </pre>
              </div>
            </details>
          )}

          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-obsidian-800 dark:bg-obsidian-950">
            {created.host ? (
              <div className="flex items-center justify-between">
                <p className="text-emerald-600 dark:text-emerald-400">
                  Linked from <span className="font-mono">{created.host}</span>.
                </p>
                {statusBadge}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <StatusDot status="UNKNOWN" pulse={true} /> Waiting for the router to check in...
              </p>
            )}
          </div>

          {!created.host && (
            <button
              type="button"
              className="mb-4 text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
              onClick={() => setShowManualFallback((v) => !v)}
            >
              {showManualFallback ? "Hide manual entry" : "This router can't reach the platform — link it manually instead"}
            </button>
          )}

          {showManualFallback && !created.host && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                linkManually.mutate();
              }}
              className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3.5 dark:border-obsidian-800 sm:grid-cols-2"
            >
              <div>
                <Label htmlFor="manualHost">Host / Public IP</Label>
                <Input id="manualHost" placeholder="192.168.88.1" value={manualHost} onChange={(e) => setManualHost(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="manualPort">API port</Label>
                <Input id="manualPort" type="number" value={manualPort} onChange={(e) => setManualPort(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="manualUsername">API username</Label>
                <Input id="manualUsername" value={manualUsername} onChange={(e) => setManualUsername(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="manualPassword">API password</Label>
                <Input id="manualPassword" type="password" value={manualPassword} onChange={(e) => setManualPassword(e.target.value)} required />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input
                  id="manualUseTls"
                  type="checkbox"
                  checked={manualUseTls}
                  onChange={(e) => setManualUseTls(e.target.checked)}
                  className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 dark:border-obsidian-700"
                />
                <Label htmlFor="manualUseTls" className="!mb-0 cursor-pointer">Use TLS (port 8729)</Label>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={linkManually.isPending} className="text-sm">
                  {linkManually.isPending ? "Linking..." : "Link manually"}
                </Button>
              </div>
            </form>
          )}

          {error && <ErrorText>{error}</ErrorText>}

          <div className="flex justify-end">
            <Button onClick={() => setStep(3)} disabled={!created.host} className="gap-1.5">
              Continue <IconChevronRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && created && (
        <Card>
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <IconCheck size={22} />
            </div>
            <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">{created.name} is linked</h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Next: assign an IP pool and enable PPPoE or Hotspot services from the router&apos;s detail page.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" onClick={() => router.push("/vouchers")}>
                Set up Hotspot
              </Button>
              <Button onClick={() => router.push("/routers")}>Go to Routers</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
