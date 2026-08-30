"use client";

import React, { useState } from "react";
import { SupportConfig } from "@/lib/captive-portal-plugins/types";

export function PortalSupportFab({ config }: { config: SupportConfig }) {
  const [open, setOpen] = useState(false);
  const [showFaq, setShowFaq] = useState(false);

  if (!config.enabled) return null;

  const whatsappUrl = `https://wa.me/${config.whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    config.whatsappGreeting || "Hello, I need help with the Wi-Fi hotspot."
  )}`;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 pointer-events-auto">
        {open && (
          <div className="flex flex-col gap-2 mb-1 animate-slide-up">
            {config.whatsappNumber && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xl transition-all"
              >
                <span>💬</span>
                <span>WhatsApp Support</span>
              </a>
            )}

            {config.phoneDialNumber && (
              <a
                href={`tel:${config.phoneDialNumber}`}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xl transition-all"
              >
                <span>📞</span>
                <span>Call Helpline</span>
              </a>
            )}

            {config.showFaqModal && (
              <button
                onClick={() => {
                  setShowFaq(true);
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shadow-xl transition-all"
              >
                <span>❓</span>
                <span>View FAQs</span>
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => setOpen(!open)}
          className="w-11 h-11 rounded-full bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center justify-center text-lg shadow-2xl hover:scale-105 active:scale-95 transition-all border border-brand-400/40"
          title="Customer Support"
        >
          {open ? "✕" : "💬"}
        </button>
      </div>

      {/* FAQ Modal */}
      {showFaq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="rounded-3xl bg-slate-900 border border-slate-700 p-6 max-w-md w-full shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setShowFaq(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-slate-800"
            >
              ✕
            </button>
            <h4 className="text-lg font-black text-white mb-1">Wi-Fi Help &amp; FAQs</h4>
            <p className="text-xs text-slate-400 mb-6">Quick solutions to common connectivity questions</p>

            <div className="space-y-3">
              {(config.faqs || []).map((faq, idx) => (
                <div key={idx} className="rounded-xl bg-slate-950 p-4 border border-slate-800 text-left">
                  <h5 className="text-xs font-bold text-brand-400 mb-1">{faq.q}</h5>
                  <p className="text-xs text-slate-300 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
