"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconMaintenance, IconLock, IconCheck, IconCopy, IconPulse } from "@/components/icons";
import {
  LandingMaintenanceConfig,
  DEFAULT_LANDING_MAINTENANCE,
  getLandingMaintenanceConfig,
  saveLandingMaintenanceConfig,
} from "@/lib/landing-maintenance";
import { LandingMaintenanceScreen } from "@/components/landing-maintenance-screen";

interface MaintenanceEvent {
  id: string;
  enabled: boolean;
  level: number;
  message: string | null;
  allowedRoles: string[];
  allowedIps: string[];
}

export default function MaintenancePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"landing" | "platform">("landing");

  // Platform API Maintenance State
  const { data } = useQuery({
    queryKey: ["maintenance-admin"],
    queryFn: () => apiFetch<MaintenanceEvent>("/api/v1/platform/maintenance"),
  });

  const [platformEnabled, setPlatformEnabled] = useState(false);
  const [platformLevel, setPlatformLevel] = useState(2);
  const [platformMessage, setPlatformMessage] = useState("");
  const [platformError, setPlatformError] = useState<string | null>(null);

  // Landing Page Specific Maintenance State
  const [landingConfig, setLandingConfig] = useState<LandingMaintenanceConfig>(DEFAULT_LANDING_MAINTENANCE);
  const [landingSaved, setLandingSaved] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [copiedBypass, setCopiedBypass] = useState(false);

  useEffect(() => {
    if (data) {
      setPlatformEnabled(data.enabled);
      setPlatformLevel(data.level);
      setPlatformMessage(data.message ?? "");
    }
    // Load landing page maintenance config
    setLandingConfig(getLandingMaintenanceConfig());
  }, [data]);

  const updatePlatform = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/platform/maintenance", {
        method: "POST",
        body: JSON.stringify({
          enabled: platformEnabled,
          level: platformLevel,
          message: platformMessage || undefined,
          allowedRoles: ["SUPER_ADMIN"],
          allowedIps: [],
          allowLogin: true,
          allowCustomerPortal: !platformEnabled,
          allowPayments: true,
          allowWebhooks: true,
          allowApi: true,
        }),
      }),
    onSuccess: () => {
      setPlatformError(null);
      queryClient.invalidateQueries({ queryKey: ["maintenance-admin"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-status"] });
    },
    onError: (err) => setPlatformError(err instanceof ApiRequestError ? err.message : "Update failed"),
  });

  const handleSaveLandingConfig = () => {
    saveLandingMaintenanceConfig(landingConfig);
    setLandingSaved(true);
    setTimeout(() => setLandingSaved(false), 2500);
  };

  const copyBypassLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/?bypass=${encodeURIComponent(landingConfig.bypassSecret)}`;
    navigator.clipboard.writeText(url);
    setCopiedBypass(true);
    setTimeout(() => setCopiedBypass(false), 2000);
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="warning">Super Admin Operations</Badge>
          {landingConfig.enabled && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-mono font-bold animate-pulse">
              LANDING PAGE LOCKED
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <IconMaintenance size={20} />
          </span>
          System Maintenance &amp; Public Access Control
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gate public website traffic, display scheduled upgrade notices, and manage emergency platform bypasses.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("landing")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "landing"
              ? "bg-brand-600 text-white shadow-glow"
              : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-white"
          }`}
        >
          <span>🌐</span>
          <span>Landing Page Maintenance Mode</span>
          {landingConfig.enabled && (
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("platform")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "platform"
              ? "bg-brand-600 text-white shadow-glow"
              : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-white"
          }`}
        >
          <span>⚙️</span>
          <span>Core API &amp; Platform Locks</span>
        </button>
      </div>

      {/* TAB 1: LANDING PAGE MAINTENANCE MODE */}
      {activeTab === "landing" && (
        <div className="space-y-6">
          <Card className="space-y-5 p-6 border-amber-500/30">
            {/* Primary Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Landing Page Maintenance Mode Lock
                  </p>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    landingConfig.enabled
                      ? "bg-amber-500 text-slate-950"
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {landingConfig.enabled ? "ACTIVE (VISITORS BLOCKED)" : "DISABLED (PUBLIC ACCESSIBLE)"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  When enabled, all visitors to <code className="text-brand-400 font-mono">/</code> will see the scheduled upgrade notice instead of the marketing website.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={landingConfig.enabled}
                  onChange={(e) =>
                    setLandingConfig({ ...landingConfig, enabled: e.target.checked })
                  }
                  className="h-6 w-6 rounded text-amber-600 focus:ring-amber-500"
                />
              </label>
            </div>

            {/* Notice Headline */}
            <div>
              <Label htmlFor="landing-headline">Maintenance Notice Headline</Label>
              <Input
                id="landing-headline"
                value={landingConfig.headline}
                onChange={(e) =>
                  setLandingConfig({ ...landingConfig, headline: e.target.value })
                }
                placeholder="e.g. Scheduled Telecom Infrastructure Upgrade in Progress"
              />
            </div>

            {/* Detailed Notice Message */}
            <div>
              <Label htmlFor="landing-message">Public Explanation Notice</Label>
              <textarea
                id="landing-message"
                rows={3}
                value={landingConfig.message}
                onChange={(e) =>
                  setLandingConfig({ ...landingConfig, message: e.target.value })
                }
                placeholder="Explain what is happening, reassurance that subscriber connections remain active..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed font-sans"
              />
            </div>

            {/* Grid: ETA & Emergency Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="landing-eta">Estimated Completion (ETA)</Label>
                <Input
                  id="landing-eta"
                  value={landingConfig.estimatedCompletion}
                  onChange={(e) =>
                    setLandingConfig({
                      ...landingConfig,
                      estimatedCompletion: e.target.value,
                    })
                  }
                  placeholder="e.g. Expected completion in 45 minutes (04:30 AM EAT)"
                />
              </div>

              <div>
                <Label htmlFor="landing-contact">Emergency NOC WhatsApp / Phone</Label>
                <Input
                  id="landing-contact"
                  value={landingConfig.emergencyContact}
                  onChange={(e) =>
                    setLandingConfig({
                      ...landingConfig,
                      emergencyContact: e.target.value,
                    })
                  }
                  placeholder="e.g. +254 700 000 000"
                />
              </div>
            </div>

            {/* Super Admin Bypass Key Configuration */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconLock size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Staff &amp; Super Admin Bypass Secret
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyBypassLink}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-cyan-300 flex items-center gap-1.5 transition-colors"
                >
                  {copiedBypass ? <IconCheck size={12} className="text-emerald-400" /> : <IconCopy size={12} />}
                  <span>{copiedBypass ? "Copied URL!" : "Copy Bypass URL"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <Label htmlFor="landing-bypass">Secret Bypass Key</Label>
                  <Input
                    id="landing-bypass"
                    value={landingConfig.bypassSecret}
                    onChange={(e) =>
                      setLandingConfig({
                        ...landingConfig,
                        bypassSecret: e.target.value,
                      })
                    }
                    placeholder="e.g. mkg-superadmin-bypass"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    Append <code className="text-cyan-400">?bypass={landingConfig.bypassSecret}</code> to any URL to view the live site.
                  </p>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={landingConfig.allowAdminBypass}
                      onChange={(e) =>
                        setLandingConfig({
                          ...landingConfig,
                          allowAdminBypass: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded text-brand-600"
                    />
                    <span>Allow logged-in Super Admins to auto-bypass</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Subsystem Telemetry Toggles */}
            <div className="space-y-2 pt-1">
              <Label>Public Telemetry Status on Maintenance Screen</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                {landingConfig.affectedServices.map((srv, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <span className="text-slate-300 font-sans text-xs">{srv.name}</span>
                    <select
                      value={srv.status}
                      onChange={(e) => {
                        const current = landingConfig.affectedServices[idx];
                        if (!current) return;
                        const updated = [...landingConfig.affectedServices];
                        updated[idx] = {
                          name: current.name,
                          status: e.target.value as "OPERATIONAL" | "MAINTENANCE" | "UPGRADING",
                        };
                        setLandingConfig({ ...landingConfig, affectedServices: updated });
                      }}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[10px] font-bold text-white focus:outline-none"
                    >
                      <option value="OPERATIONAL">OPERATIONAL</option>
                      <option value="UPGRADING">UPGRADING</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <Button onClick={handleSaveLandingConfig} className="font-bold gap-2">
                  {landingSaved ? <IconCheck size={16} className="text-emerald-300" /> : <IconMaintenance size={16} />}
                  <span>{landingSaved ? "Settings Applied & Saved!" : "Save Landing Maintenance Settings"}</span>
                </Button>

                <button
                  type="button"
                  onClick={() => setShowPreviewModal(true)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800/80 hover:bg-slate-700/80 text-white font-bold text-xs transition-all flex items-center gap-2"
                >
                  <span>👁️</span>
                  <span>Preview Maintenance Screen</span>
                </button>
              </div>

              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-400 hover:underline font-mono"
              >
                Open Landing Page in New Tab &rarr;
              </a>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: PLATFORM API & DATABASE MAINTENANCE */}
      {activeTab === "platform" && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-obsidian-950 border border-slate-200 dark:border-obsidian-800">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Global Platform State</p>
              <p className="text-xs text-slate-500">Enable global maintenance banner and gate non-admin portals</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={platformEnabled}
                onChange={(e) => setPlatformEnabled(e.target.checked)}
                className="h-5 w-5 rounded text-amber-600 focus:ring-amber-500"
              />
            </label>
          </div>

          <div>
            <Label htmlFor="level">Severity Level (1 = Low, 5 = Critical Outage)</Label>
            <Input
              id="level"
              type="number"
              min={1}
              max={5}
              value={platformLevel}
              onChange={(e) => setPlatformLevel(Number(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="message">Public Notification Message</Label>
            <Input
              id="message"
              placeholder="e.g. Upgrading core fiber routing tables. Customer portal read-only."
              value={platformMessage}
              onChange={(e) => setPlatformMessage(e.target.value)}
            />
          </div>

          {platformError && <ErrorText>{platformError}</ErrorText>}

          <div className="pt-2">
            <Button onClick={() => updatePlatform.mutate()} disabled={updatePlatform.isPending}>
              {updatePlatform.isPending ? "Broadcasting state..." : "Save Platform Settings"}
            </Button>
          </div>
        </Card>
      )}

      {/* Full-Screen Preview Modal for Super Admin */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-obsidian-950 overflow-y-auto">
          <div className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-xs text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span>SUPER ADMIN PREVIEW: Public Landing Page Under Maintenance</span>
            </div>
            <button
              onClick={() => setShowPreviewModal(false)}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-white transition-colors"
            >
              Close Preview (Esc)
            </button>
          </div>

          <div className="flex-1">
            <LandingMaintenanceScreen
              config={landingConfig}
              onBypass={() => {
                alert("Bypass verified successfully!");
                return true;
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
