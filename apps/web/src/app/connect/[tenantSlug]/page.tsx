"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";

/**
 * The ISP's public "get connected" page: check whether your location is covered, pick a plan,
 * and leave your details. The request becomes a lead for the ISP's staff, who call back and
 * book the installation. Works on a phone, in English or Swahili.
 */

interface Info {
  isp: string;
  brandColor: string | null;
  logoUrl: string | null;
  packages: { id: string; name: string; downloadKbps: number; uploadKbps: number; priceMinor: number; currency: string; billingCycle: string }[];
}

interface Coverage {
  covered: boolean | null;
  distanceKm: number | null;
  nearestSite: string | null;
  radiusKm: number;
}

const S = {
  en: {
    title: (isp: string) => `Get connected to ${isp}`,
    lead: "Check if we cover your area, choose a plan, and we'll call you to book the installation.",
    step1: "1. Are you covered?",
    useLocation: "Use my location",
    locating: "Finding you…",
    noLocation: "We couldn't get your location. You can still send your details and we'll check for you.",
    covered: (site: string | null) => `Good news: you're in our coverage${site ? ` near ${site}` : ""}.`,
    notCovered: (km: number | null) => `You're about ${km} km from our network right now. Send your details anyway: we're growing and will tell you when we reach you.`,
    unknown: "We'll check coverage at your address and call you.",
    step2: "2. Choose a plan",
    noPlan: "Not sure yet",
    perMonth: "a month",
    step3: "3. Your details",
    name: "Full name",
    phone: "Phone number",
    email: "Email (optional)",
    address: "Where to install (estate, street, house)",
    notes: "Anything else we should know (optional)",
    send: "Request connection",
    sending: "Sending…",
    thanks: "Thank you! We have your request and will call you soon.",
    thanksSms: "We've also sent you an SMS.",
    notFound: "This page isn't available.",
    error: "Something went wrong. Please try again.",
  },
  sw: {
    title: (isp: string) => `Unganishwa na ${isp}`,
    lead: "Angalia kama tunafika eneo lako, chagua mpango, nasi tutakupigia simu kupanga usakinishaji.",
    step1: "1. Je, tunafika kwako?",
    useLocation: "Tumia mahali nilipo",
    locating: "Tunakutafuta…",
    noLocation: "Hatukuweza kupata mahali ulipo. Bado unaweza kutuma maelezo yako nasi tutakuangalizia.",
    covered: (site: string | null) => `Habari njema: uko ndani ya eneo letu${site ? ` karibu na ${site}` : ""}.`,
    notCovered: (km: number | null) => `Uko takriban km ${km} kutoka mtandao wetu kwa sasa. Tuma maelezo yako hata hivyo: tunapanuka na tutakujulisha tukikufikia.`,
    unknown: "Tutaangalia huduma kwenye anwani yako na kukupigia simu.",
    step2: "2. Chagua mpango",
    noPlan: "Bado sijaamua",
    perMonth: "kwa mwezi",
    step3: "3. Maelezo yako",
    name: "Jina kamili",
    phone: "Nambari ya simu",
    email: "Barua pepe (si lazima)",
    address: "Mahali pa kusakinisha (mtaa, barabara, nyumba)",
    notes: "Kitu kingine tunachopaswa kujua (si lazima)",
    send: "Omba kuunganishwa",
    sending: "Inatuma…",
    thanks: "Asante! Tumepokea ombi lako na tutakupigia simu hivi karibuni.",
    thanksSms: "Tumekutumia pia SMS.",
    notFound: "Ukurasa huu haupatikani.",
    error: "Kuna tatizo. Tafadhali jaribu tena.",
  },
};

export default function ConnectPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [lang, setLang] = useState<"en" | "sw">("en");
  const t = S[lang];
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", address: "", notes: "", packageId: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Info>(`/api/v1/signup/${encodeURIComponent(tenantSlug)}`)
      .then(setInfo)
      .catch(() => setMissing(true));
  }, [tenantSlug]);

  function locate() {
    setLocError(false);
    if (!navigator.geolocation) return setLocError(true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        try {
          setCoverage(await apiFetch<Coverage>(`/api/v1/signup/${encodeURIComponent(tenantSlug)}/coverage?lat=${c.lat}&lng=${c.lng}`));
        } catch {
          setLocError(true);
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocError(true);
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/signup/${encodeURIComponent(tenantSlug)}/leads`, {
        method: "POST",
        body: JSON.stringify({ ...form, latitude: coords?.lat, longitude: coords?.lng }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  const accent = info?.brandColor || "#0369a1";
  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-slate-500";

  return (
    <main className="theme-native min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="flex justify-end">
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
            {(["en", "sw"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} className={`px-2.5 py-1 ${lang === l ? "bg-slate-200 font-semibold" : "text-slate-500"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {missing && <p className="rounded-2xl bg-white p-6 text-center shadow-sm">{t.notFound}</p>}

        {info && (
          <>
            <header className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {info.logoUrl && <img src={info.logoUrl} alt="" className="h-10 w-auto" />}
              <h1 className="text-2xl font-bold">{t.title(info.isp)}</h1>
              <p className="text-sm text-slate-600">{t.lead}</p>
            </header>

            {done ? (
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-lg font-semibold">{t.thanks}</p>
                <p className="mt-1 text-sm text-slate-600">{t.thanksSms}</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="font-semibold">{t.step1}</h2>
                  <button type="button" onClick={locate} disabled={locating} className="rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: accent }}>
                    {locating ? t.locating : t.useLocation}
                  </button>
                  {locError && <p className="text-sm text-slate-600">{t.noLocation}</p>}
                  {coverage && (
                    <p className={`rounded-lg p-3 text-sm ${coverage.covered ? "bg-emerald-50 text-emerald-800" : coverage.covered === false ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                      {coverage.covered ? t.covered(coverage.nearestSite) : coverage.covered === false ? t.notCovered(coverage.distanceKm) : t.unknown}
                    </p>
                  )}
                </section>

                {info.packages.length > 0 && (
                  <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                    <h2 className="font-semibold">{t.step2}</h2>
                    <div className="grid gap-2">
                      {info.packages.map((p) => (
                        <label key={p.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-3 text-sm ${form.packageId === p.id ? "border-slate-900" : "border-slate-200"}`}>
                          <span className="flex items-center gap-2">
                            <input type="radio" name="plan" checked={form.packageId === p.id} onChange={() => setForm({ ...form, packageId: p.id })} />
                            <span>
                              <span className="block font-medium">{p.name}</span>
                              <span className="text-slate-500">{Math.round(p.downloadKbps / 1000)} Mbps</span>
                            </span>
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatMoney(p.priceMinor, p.currency)}
                            {p.billingCycle === "MONTHLY" && <span className="block text-right text-xs font-normal text-slate-500">{t.perMonth}</span>}
                          </span>
                        </label>
                      ))}
                      <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm ${form.packageId === "" ? "border-slate-900" : "border-slate-200"}`}>
                        <input type="radio" name="plan" checked={form.packageId === ""} onChange={() => setForm({ ...form, packageId: "" })} />
                        {t.noPlan}
                      </label>
                    </div>
                  </section>
                )}

                <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="font-semibold">{t.step3}</h2>
                  <div>
                    <label htmlFor="c-name" className="mb-1 block text-sm font-medium">{t.name}</label>
                    <input id="c-name" required minLength={2} autoComplete="name" className={input} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c-phone" className="mb-1 block text-sm font-medium">{t.phone}</label>
                    <input id="c-phone" required type="tel" autoComplete="tel" placeholder="07XX XXX XXX" className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c-email" className="mb-1 block text-sm font-medium">{t.email}</label>
                    <input id="c-email" type="email" autoComplete="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c-addr" className="mb-1 block text-sm font-medium">{t.address}</label>
                    <input id="c-addr" required minLength={3} autoComplete="street-address" className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c-notes" className="mb-1 block text-sm font-medium">{t.notes}</label>
                    <textarea id="c-notes" rows={3} maxLength={1000} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                  {/* Hidden from people; bots that fill every field give themselves away. */}
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                  {error && <p className="text-sm text-rose-700">{error}</p>}
                  <button type="submit" disabled={busy} className="w-full rounded-lg px-4 py-3 text-base font-medium text-white disabled:opacity-60" style={{ backgroundColor: accent }}>
                    {busy ? t.sending : t.send}
                  </button>
                </section>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
