"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { IconCheck, IconPulse, IconRouter, IconShield, IconArrowRight } from "@/components/icons";

interface CustomerDrop {
  accountNumber: string;
  name: string;
  estate: string;
  pppoeUser: string;
  rxPowerDbm: number;
  status: "ONLINE" | "OFFLINE" | "ATTENUATED";
  ipAddress: string;
  splitterPort: string;
}

const SAMPLE_CUSTOMERS: CustomerDrop[] = [
  {
    accountNumber: "ACC-90124",
    name: "James Mwangi",
    estate: "Kilimani - Wood Avenue Court Apt 4B",
    pppoeUser: "mwangi_kilimani_ftth",
    rxPowerDbm: -19.4,
    status: "ONLINE",
    ipAddress: "100.64.14.82",
    splitterPort: "DP-KLM-04 / Port 7",
  },
  {
    accountNumber: "ACC-88419",
    name: "Amina Hassan",
    estate: "South B - Mariakani Estate Block C",
    pppoeUser: "amina_southb_50m",
    rxPowerDbm: -27.8,
    status: "ATTENUATED",
    ipAddress: "100.64.12.19",
    splitterPort: "DP-STB-02 / Port 3",
  },
  {
    accountNumber: "ACC-77301",
    name: "David Ochieng",
    estate: "Westlands - Rhapta Road Court",
    pppoeUser: "ochieng_westlands",
    rxPowerDbm: -34.2,
    status: "OFFLINE",
    ipAddress: "0.0.0.0",
    splitterPort: "DP-WST-08 / Port 1",
  },
];

export function MobileFieldTool() {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDrop>(SAMPLE_CUSTOMERS[0]!);
  const [resettingSession, setResettingSession] = useState(false);
  const [sessionResetSuccess, setSessionResetSuccess] = useState(false);
  const [ontSerial, setOntSerial] = useState("HWTC89A120FC");
  const [savingOnt, setSavingOnt] = useState(false);
  const [savedOnt, setSavedOnt] = useState(false);

  const handleResetSession = () => {
    setResettingSession(true);
    setTimeout(() => {
      setResettingSession(false);
      setSessionResetSuccess(true);
      setTimeout(() => setSessionResetSuccess(false), 3000);
    }, 1200);
  };

  const handleSaveOnt = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOnt(true);
    setTimeout(() => {
      setSavingOnt(false);
      setSavedOnt(true);
      setTimeout(() => setSavedOnt(false), 2500);
    }, 800);
  };

  return (
    <Card className="p-6 lg:p-8 space-y-6 border-slate-800 bg-slate-950/90 shadow-2xl font-sans text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info">Mobile Field Technician Mode</Badge>
            <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400 font-mono text-[10px]">
              GPS Drop Box Alignment
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">
            On-Site Optical Signal &amp; ONT Drop Provisioner
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Engineered for African fiber splicers and WISP field teams to test optical attenuation (dBm) and reset MikroTik PPPoE sessions straight from Android or iOS phones.
          </p>
        </div>

        {/* Target Customer Dropdown */}
        <div className="shrink-0 font-mono text-xs">
          <span className="text-slate-500 text-[10px] block mb-1">SELECT FIELD WORK ORDER:</span>
          <select
            value={selectedCustomer.accountNumber}
            onChange={(e) => {
              const found = SAMPLE_CUSTOMERS.find((c) => c.accountNumber === e.target.value);
              if (found) setSelectedCustomer(found);
            }}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-brand-500"
          >
            {SAMPLE_CUSTOMERS.map((c) => (
              <option key={c.accountNumber} value={c.accountNumber}>
                {c.name} ({c.accountNumber})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Optical Power Telemetry Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        {/* Signal Level Card */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <span className="text-slate-500 text-[10px] block uppercase">ONT Optical Rx Power</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black ${
              selectedCustomer.rxPowerDbm >= -24
                ? "text-emerald-400"
                : selectedCustomer.rxPowerDbm >= -27
                ? "text-amber-400"
                : "text-rose-500 animate-pulse"
            }`}>
              {selectedCustomer.rxPowerDbm} dBm
            </span>
            <span className="text-[10px] text-slate-400 font-sans">
              {selectedCustomer.rxPowerDbm >= -24
                ? "Optimal Signal"
                : selectedCustomer.rxPowerDbm >= -27
                ? "High Attenuation"
                : "Fiber Drop Cut / Severed"}
            </span>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                selectedCustomer.rxPowerDbm >= -24
                  ? "bg-emerald-500 w-3/4"
                  : selectedCustomer.rxPowerDbm >= -27
                  ? "bg-amber-500 w-1/2"
                  : "bg-rose-500 w-1/6"
              }`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>-15 dBm (Strong)</span>
            <span>-28 dBm (Cutoff)</span>
          </div>
        </div>

        {/* Drop Box Location & Port */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5 font-sans">
          <span className="text-slate-500 text-[10px] font-mono block uppercase">Physical Distribution Point</span>
          <div className="font-bold text-white text-sm">{selectedCustomer.splitterPort}</div>
          <div className="text-xs text-slate-400">{selectedCustomer.estate}</div>
          <div className="text-[11px] font-mono text-cyan-400 pt-1">
            Assigned IP: {selectedCustomer.ipAddress}
          </div>
        </div>

        {/* Quick Actions (CoA Disconnect / Reset) */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3 font-sans">
          <div>
            <span className="text-slate-500 text-[10px] font-mono block uppercase">FreeRADIUS Session CoA</span>
            <div className="text-xs text-slate-300">Force MikroTik to drop and rebind PPPoE session</div>
          </div>

          {sessionResetSuccess ? (
            <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-xs font-mono text-center flex items-center justify-center gap-1.5 animate-pulse">
              <IconCheck size={14} />
              <span>CoA Disconnect Sent (0.4s)</span>
            </div>
          ) : (
            <button
              onClick={handleResetSession}
              disabled={resettingSession}
              className="w-full py-2.5 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs shadow-glow transition-all flex items-center justify-center gap-2"
            >
              <IconPulse size={14} className={resettingSession ? "animate-spin" : ""} />
              <span>{resettingSession ? "Sending RFC 3576 CoA..." : "Send PPPoE Reset (CoA)"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ONT Serial Assignment Form */}
      <form onSubmit={handleSaveOnt} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col sm:flex-row items-end gap-3 font-sans">
        <div className="flex-1 w-full">
          <Label htmlFor="ont-serial">Scan or Enter Subscriber ONT Serial / GPON SN</Label>
          <Input
            id="ont-serial"
            value={ontSerial}
            onChange={(e) => setOntSerial(e.target.value.toUpperCase())}
            placeholder="e.g. ZTEG0192A418 / HWTC89A120FC"
            className="font-mono text-xs"
          />
        </div>
        <button
          type="submit"
          disabled={savingOnt}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-glow transition-all flex items-center justify-center gap-2 shrink-0"
        >
          {savedOnt ? <IconCheck size={14} className="text-emerald-300" /> : <IconRouter size={14} />}
          <span>{savingOnt ? "Authorizing on OLT..." : savedOnt ? "ONT Bound & Verified!" : "Bind to Subscriber"}</span>
        </button>
      </form>
    </Card>
  );
}
