"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { IconCheck, IconTicket, IconCopy } from "@/components/icons";

interface VoucherSample {
  pin: string;
  plan: string;
  price: string;
  duration: string;
  qrUrl: string;
  serial: string;
}

const SAMPLE_BATCH: VoucherSample[] = [
  { pin: "MKG-8492-91", plan: "1-Hour Quick Pass", price: "KES 10", duration: "1 Hour (5 Mbps)", qrUrl: "https://wifi.mashupkgrid.com/login?pin=MKG-8492-91", serial: "SN-0091" },
  { pin: "MKG-3120-74", plan: "3-Hour Super Speed", price: "KES 20", duration: "3 Hours (10 Mbps)", qrUrl: "https://wifi.mashupkgrid.com/login?pin=MKG-3120-74", serial: "SN-0092" },
  { pin: "MKG-9541-18", plan: "24-Hour Day Pass", price: "KES 50", duration: "24 Hours (Unlimited)", qrUrl: "https://wifi.mashupkgrid.com/login?pin=MKG-9541-18", serial: "SN-0093" },
  { pin: "MKG-6602-53", plan: "7-Day Weekly Bundle", price: "KES 250", duration: "7 Days (Unlimited)", qrUrl: "https://wifi.mashupkgrid.com/login?pin=MKG-6602-53", serial: "SN-0094" },
];

export function ThermalVoucherPrinter() {
  const [printMode, setPrintMode] = useState<"pos" | "a4">("pos");
  const [brandName, setBrandName] = useState("Nairobi FastNet Public Wi-Fi");
  const [ssid, setSsid] = useState("@Nairobi_FastNet_Free");
  const [supportLine, setSupportLine] = useState("+254 712 345 678");

  const handlePrint = () => {
    window.print();
  };

  return (
    <Card className="p-6 lg:p-8 space-y-6 border-slate-800 bg-slate-950/90 shadow-2xl font-sans text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info">Thermal POS &amp; Voucher Engine</Badge>
            <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-400 font-mono text-[10px]">
              58mm / 80mm Roll &amp; A4 Sheet Ready
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">
            High-Speed Wi-Fi Voucher POS Printer &amp; QR Generator
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Print instant internet vouchers for cybercafes, retail kiosks, hotels, and event gates with auto-login QR codes.
          </p>
        </div>

        {/* Print Mode Switcher */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
          <button
            onClick={() => setPrintMode("pos")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              printMode === "pos" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
            }`}
          >
            🧾 80mm Thermal Slip
          </button>
          <button
            onClick={() => setPrintMode("a4")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              printMode === "a4" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
            }`}
          >
            📄 A4 Tear-Off Grid
          </button>
        </div>
      </div>

      {/* Brand & Printer Config */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <Label htmlFor="v-brand">Brand / Hotspot Venue</Label>
          <Input id="v-brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="v-ssid">Wi-Fi SSID Name</Label>
          <Input id="v-ssid" value={ssid} onChange={(e) => setSsid(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="v-support">Support Contact Line</Label>
          <Input id="v-support" value={supportLine} onChange={(e) => setSupportLine(e.target.value)} />
        </div>
      </div>

      {/* Live Preview Area */}
      {printMode === "pos" ? (
        /* 80mm Thermal Receipt Preview */
        <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
          <div className="w-[280px] bg-white text-black p-5 rounded-md shadow-2xl font-mono text-xs text-center border border-dashed border-slate-300 print:w-full print:m-0 print:border-none">
            <div className="font-extrabold text-sm uppercase tracking-wider">{brandName}</div>
            <div className="text-[11px] text-gray-700 mt-0.5">High-Speed Wi-Fi Voucher</div>
            <div className="my-2 border-b border-dashed border-gray-400" />

            <div className="text-[11px] text-left space-y-0.5">
              <div><strong>Connect to:</strong> {ssid}</div>
              <div><strong>Package:</strong> {SAMPLE_BATCH[2]?.plan}</div>
              <div><strong>Validity:</strong> {SAMPLE_BATCH[2]?.duration}</div>
              <div><strong>Price:</strong> {SAMPLE_BATCH[2]?.price}</div>
            </div>

            <div className="my-3 p-3 bg-gray-50 border border-gray-300 rounded text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">YOUR VOUCHER PIN</div>
              <div className="text-xl font-black tracking-widest text-black mt-1">
                {SAMPLE_BATCH[2]?.pin}
              </div>
            </div>

            {/* Simulated Vector QR Code */}
            <div className="mx-auto my-3 w-28 h-28 bg-gray-950 p-2 rounded flex flex-col items-center justify-center text-white">
              <div className="grid grid-cols-6 gap-1 w-full h-full p-1 bg-white">
                <div className="bg-black col-span-2 row-span-2" />
                <div className="bg-black col-span-2" />
                <div className="bg-black col-span-2 row-span-2" />
                <div className="bg-black col-span-2" />
                <div className="bg-black col-span-1" />
                <div className="bg-black col-span-3" />
                <div className="bg-black col-span-2 row-span-2" />
                <div className="bg-black col-span-2" />
                <div className="bg-black col-span-2 row-span-2" />
              </div>
            </div>
            <div className="text-[9px] text-gray-600">Scan with Phone Camera for Instant Login</div>

            <div className="my-2 border-b border-dashed border-gray-400" />
            <div className="text-[9px] text-gray-500">
              Helpline: {supportLine}<br />
              Powered by Mashupkgrid Cloud RADIUS
            </div>
          </div>
        </div>
      ) : (
        /* A4 Sheet Grid Preview */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SAMPLE_BATCH.map((v, i) => (
            <div key={i} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-left font-mono">
              <div className="flex justify-between items-start">
                <span className="text-[10px] text-brand-400 font-bold uppercase">{v.plan}</span>
                <span className="text-xs font-black text-emerald-400">{v.price}</span>
              </div>
              <div className="p-2 rounded bg-slate-950 text-center border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase">PIN CODE</div>
                <div className="text-base font-black text-white tracking-widest">{v.pin}</div>
              </div>
              <div className="text-[10px] text-slate-400 flex justify-between">
                <span>{v.duration}</span>
                <span className="text-slate-500">{v.serial}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print Trigger Button */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
        <div className="text-xs text-slate-400 font-mono">
          Ready to print via ESC/POS 58mm/80mm or system print dialog
        </div>

        <Button onClick={handlePrint} className="px-6 py-2.5 font-bold shadow-glow gap-2">
          <span>🖨️</span>
          <span>{printMode === "pos" ? "Print 80mm Thermal Receipt Slip" : "Print A4 Voucher Sheet"}</span>
        </Button>
      </div>
    </Card>
  );
}
