"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { IconCheck, IconArrowRight } from "@/components/icons";

interface RegionData {
  name: string;
  counties: string;
  coverageType: "Fiber 10G Ready" | "Fiber + 60GHz Wireless" | "Metro GPON";
  status: "Full Coverage" | "Expanding" | "Ready for Drop";
  dpBox: string;
  latencyToIXP: string;
  estates: string[];
}

type RegionKey = "nairobi" | "rift" | "coast" | "western";

const REGIONS: Record<RegionKey, RegionData> = {
  nairobi: {
    name: "Nairobi Metropolitan Core",
    counties: "Nairobi & Kiambu County",
    coverageType: "Fiber 10G Ready",
    status: "Full Coverage",
    dpBox: "NRB-WST-DP04 (Westlands Core)",
    latencyToIXP: "1.1 ms",
    estates: ["Westlands", "Kilimani", "Kasarani", "Karen", "Ruiru", "South B / C", "Parklands", "CBD"],
  },
  rift: {
    name: "Rift Valley Regional Hub",
    counties: "Uasin Gishu & Nakuru County",
    coverageType: "Fiber + 60GHz Wireless",
    status: "Expanding",
    dpBox: "ELD-CBD-DP02 (Eldoret Hub)",
    latencyToIXP: "4.8 ms",
    estates: ["Eldoret Town", "Nakuru CBD", "Section 58", "Milimani Nakuru", "Naivasha Town"],
  },
  coast: {
    name: "Coast Broadband Corridor",
    counties: "Mombasa & Kwale County",
    coverageType: "Metro GPON",
    status: "Full Coverage",
    dpBox: "MSA-NYL-DP01 (Nyali Exchange)",
    latencyToIXP: "2.3 ms",
    estates: ["Nyali", "Mombasa Island", "Bamburi", "Kizingo", "Diani Beach", "Shanzu"],
  },
  western: {
    name: "Lake Basin & Western Hub",
    counties: "Kisumu & Kakamega County",
    coverageType: "Fiber + 60GHz Wireless",
    status: "Expanding",
    dpBox: "KSM-MIL-DP03 (Kisumu Core)",
    latencyToIXP: "5.2 ms",
    estates: ["Kisumu CBD", "Milimani Kisumu", "Riat Hills", "Kakamega Town", "Maseno"],
  },
};

export function CoverageMapChecker() {
  const [selectedRegion, setSelectedRegion] = useState<RegionKey>("nairobi");
  const [searchEstate, setSearchEstate] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  const region = REGIONS[selectedRegion];

  const filteredEstates = region.estates.filter((e) =>
    e.toLowerCase().includes(searchEstate.toLowerCase())
  );

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLeadSubmitted(true);
    setTimeout(() => {
      setLeadSubmitted(false);
      setLeadName("");
      setLeadPhone("");
    }, 4000);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="info">GIS Network Telemetry</Badge>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>KIXP Peering Points Active</span>
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">
            Interactive Fiber &amp; Wireless Coverage Checker
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Check live optical distribution points (DPs), line-of-sight wireless towers, and submit instant connection requests for Kenyan neighborhoods.
          </p>
        </div>

        {/* Region Switcher */}
        <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-1 text-xs font-mono">
          <button
            onClick={() => setSelectedRegion("nairobi")}
            className={`px-3 py-1 rounded transition-all ${
              selectedRegion === "nairobi" ? "bg-brand-600 text-white font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Nairobi Metro
          </button>
          <button
            onClick={() => setSelectedRegion("rift")}
            className={`px-3 py-1 rounded transition-all ${
              selectedRegion === "rift" ? "bg-brand-600 text-white font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Rift Valley
          </button>
          <button
            onClick={() => setSelectedRegion("coast")}
            className={`px-3 py-1 rounded transition-all ${
              selectedRegion === "coast" ? "bg-brand-600 text-white font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Coast Corridor
          </button>
          <button
            onClick={() => setSelectedRegion("western")}
            className={`px-3 py-1 rounded transition-all ${
              selectedRegion === "western" ? "bg-brand-600 text-white font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Lake Basin
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Interactive GIS Topology Map Graphic */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 p-6 min-h-[380px] flex flex-col justify-between overflow-hidden shadow-inner">
            {/* Ambient Map Grid */}
            <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />

            {/* Map Top Bar */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono pb-3 border-b border-slate-800/80">
              <div>
                <span className="text-slate-400">Target Hub: </span>
                <span className="text-white font-bold">{region.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                  {region.status}
                </span>
                <span className="text-slate-400">Latency: {region.latencyToIXP}</span>
              </div>
            </div>

            {/* Simulated Fiber Routes SVG */}
            <div className="relative z-10 my-4 flex-1 flex items-center justify-center">
              <svg className="w-full h-48 overflow-visible" viewBox="0 0 500 200">
                <defs>
                  <linearGradient id="fiberRouteGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="50%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>

                {/* Primary Optical Backbone Line */}
                <path
                  d="M 30 100 Q 150 20, 250 100 T 470 100"
                  fill="none"
                  stroke="url(#fiberRouteGlow)"
                  strokeWidth="3.5"
                  className="animate-fiber-laser"
                />

                {/* Secondary Distribution Branch Lines */}
                <path
                  d="M 150 60 L 220 160"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="4 6"
                />
                <path
                  d="M 350 100 L 400 170"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="4 6"
                />

                {/* Central POP Node */}
                <circle cx="250" cy="100" r="8" fill="#06b6d4" className="animate-ping opacity-75" />
                <circle cx="250" cy="100" r="6" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                <text x="250" y="80" textAnchor="middle" fill="#ffffff" fontSize="11" fontFamily="monospace" fontWeight="bold">
                  {region.dpBox}
                </text>

                {/* Sub Splice Box 1 */}
                <circle cx="150" cy="60" r="5" fill="#10b981" />
                <text x="150" y="45" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                  Splice-Box A
                </text>

                {/* Sub Splice Box 2 */}
                <circle cx="400" cy="170" r="5" fill="#10b981" />
                <text x="400" y="190" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
                  Drop Terminal B
                </text>

                {/* Wireless Transmission Arc */}
                <circle cx="350" cy="100" r="28" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 5" className="animate-spin" />
                <text x="350" y="140" textAnchor="middle" fill="#f59e0b" fontSize="9" fontFamily="monospace">
                  60GHz PtMP Tower
                </text>
              </svg>
            </div>

            {/* Map Telemetry Footer */}
            <div className="relative z-10 grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-400 pt-3 border-t border-slate-800/80">
              <div>
                <span className="text-slate-500 block">Technology:</span>
                <span className="font-bold text-cyan-400">{region.coverageType}</span>
              </div>
              <div>
                <span className="text-slate-500 block">KIXP Peering:</span>
                <span className="font-bold text-white">Direct 100G</span>
              </div>
              <div>
                <span className="text-slate-500 block">Average Provisioning:</span>
                <span className="font-bold text-emerald-400">&lt; 24 Hours</span>
              </div>
            </div>
          </div>

          {/* Quick Estate Filter Chips */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Available Neighborhoods &amp; Estates</span>
              <input
                type="text"
                value={searchEstate}
                onChange={(e) => setSearchEstate(e.target.value)}
                placeholder="Search estate..."
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:border-brand-500 focus:outline-none w-36"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {filteredEstates.map((est) => (
                <span
                  key={est}
                  className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-1.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>{est}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Instant Connection Request Lead Capture Form */}
        <div className="lg:col-span-5 space-y-4 text-left font-sans">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4 shadow-xl">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-400">Get Connected</span>
              <h4 className="text-base font-bold text-white">Request Fiber Drop / Site Survey</h4>
              <p className="text-xs text-slate-400">
                Enter your details to check optical signal levels at your gate and receive a free technician survey in 24 hours.
              </p>
            </div>

            {leadSubmitted ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-5 text-center space-y-2">
                <div className="text-emerald-400 font-bold text-sm flex items-center justify-center gap-1.5">
                  <IconCheck size={18} />
                  <span>Survey Request Booked!</span>
                </div>
                <p className="text-xs text-slate-300">
                  Thank you! Our local installation dispatch team will contact you on <span className="font-mono text-white font-bold">{leadPhone || "your phone"}</span> within 2 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleLeadSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Your Full Name</label>
                  <input
                    type="text"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="e.g. Samuel Mutua"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">M-Pesa Mobile Number</label>
                  <input
                    type="text"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="0712345678"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Building / Apartment / House Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Coral Heights, Court 4B"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-glow transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Book Free Optical Survey</span>
                  <IconArrowRight size={14} />
                </button>
              </form>
            )}

            <div className="pt-2 text-[11px] font-mono text-slate-500 text-center flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Instant lead synced to ISP CRM &amp; Field Dispatch App</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
