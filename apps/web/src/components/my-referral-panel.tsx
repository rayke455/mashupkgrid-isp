"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useLanguage } from "@/lib/language-context";
import { formatMoney } from "@/lib/money";
import { Panel, darkButton } from "@/components/dashboard/surface";

interface MyReferral {
  code: string;
  isp: string;
  referred: { fullName: string; joinedAt: string; rewarded: boolean }[];
  freeDaysEarned: number;
  creditEarnedMinor: number;
}

const S = {
  en: {
    title: "Refer a neighbour",
    desc: "Share your code. When someone joins with it and makes their first payment, you get a reward.",
    code: "Your code",
    copy: "Copy",
    copied: "Copied",
    share: "Share on WhatsApp",
    message: (isp: string, code: string) => `I use ${isp} for internet. Give them my code ${code} when you sign up.`,
    referred: (n: number) => (n === 0 ? "Nobody has joined with your code yet." : `${n} joined with your code.`),
    earned: "Earned so far",
    days: (n: number) => `${n} free days`,
    rewarded: "Rewarded",
    waiting: "Waiting for first payment",
  },
  sw: {
    title: "Mlete jirani",
    desc: "Shiriki msimbo wako. Mtu akijiunga nao na kulipa mara ya kwanza, unapata zawadi.",
    code: "Msimbo wako",
    copy: "Nakili",
    copied: "Imenakiliwa",
    share: "Shiriki kwa WhatsApp",
    message: (isp: string, code: string) => `Mimi hutumia ${isp} kwa intaneti. Wape msimbo wangu ${code} unapojiunga.`,
    referred: (n: number) => (n === 0 ? "Bado hakuna aliyejiunga na msimbo wako." : `Watu ${n} wamejiunga na msimbo wako.`),
    earned: "Ulichopata hadi sasa",
    days: (n: number) => `siku ${n} za bure`,
    rewarded: "Umezawadiwa",
    waiting: "Anasubiri malipo ya kwanza",
  },
};

/** The signed-in customer's referral code, with copy and WhatsApp share, and what it earned. */
export function MyReferralPanel() {
  const { lang } = useLanguage();
  const t = S[lang];
  const [copied, setCopied] = useState(false);
  const { data } = useQuery({ queryKey: ["me-referral"], queryFn: () => apiFetch<MyReferral>("/api/v1/me/referral") });
  if (!data) return null;
  const earned = [data.freeDaysEarned ? t.days(data.freeDaysEarned) : null, data.creditEarnedMinor ? formatMoney(data.creditEarnedMinor) : null].filter(Boolean).join(" + ");

  return (
    <Panel title={t.title} description={t.desc}>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs text-slate-400">{t.code}</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-white">{data.code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={darkButton("secondary", "sm")}
            onClick={() => {
              void navigator.clipboard?.writeText(data.code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? t.copied : t.copy}
          </button>
          <a className={darkButton("primary", "sm")} href={`https://wa.me/?text=${encodeURIComponent(t.message(data.isp, data.code))}`} target="_blank" rel="noreferrer">
            {t.share}
          </a>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-300">
        {t.referred(data.referred.length)} {earned && `${t.earned}: ${earned}.`}
      </p>
      {data.referred.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {data.referred.slice(0, 8).map((r, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="text-white">{r.fullName}</span>
              <span className={r.rewarded ? "text-emerald-400" : "text-slate-400"}>{r.rewarded ? t.rewarded : t.waiting}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
