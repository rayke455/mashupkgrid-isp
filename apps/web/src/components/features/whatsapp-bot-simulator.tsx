"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { IconCheck, IconMpesa } from "@/components/icons";

interface Message {
  id: string;
  sender: "bot" | "user";
  text: string;
  time: string;
  options?: { label: string; action: string }[];
  voucherCard?: { code: string; plan: string; price: string };
}

export function WhatsAppBotSimulator() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "Welcome to MASHUPKGRID ISP Self-Service. How can we assist your broadband connection today?",
      time: "10:24 AM",
      options: [
        { label: "1. Check Balance & Renew", action: "balance" },
        { label: "2. Buy Hotspot WiFi Voucher", action: "voucher" },
        { label: "3. Report Fiber Outage", action: "outage" },
        { label: "4. Contact NOC Engineer", action: "engineer" },
      ],
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState("");

  const handleAction = (action: string, label: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: label,
      time: "10:25 AM",
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      let botResponse: Message;

      if (action === "balance") {
        botResponse = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: `Account: Brian Kimani (ACC-89210)\nService Plan: Gold Home Fiber (50 Mbps Uncapped)\nRenewal Date: In 3 days (Sept 1, 2026)\nAmount Due: KES 3,500\n\nClick below to trigger an instant Safaricom M-Pesa STK Push prompt to your phone:`,
          time: "10:25 AM",
          options: [{ label: "Pay KES 3,500 via M-Pesa STK", action: "pay_stk" }],
        };
      } else if (action === "pay_stk") {
        botResponse = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: `M-Pesa STK push prompt dispatched to 0712***081 for KES 3,500.\nEnter your M-Pesa PIN on your phone to complete instant renewal.\n\nOnce confirmed, your MikroTik queue is refreshed automatically in < 2 seconds.`,
          time: "10:25 AM",
        };
      } else if (action === "voucher") {
        botResponse = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: `Select your public hotspot voucher pass:`,
          time: "10:25 AM",
          options: [
            { label: "1-Hour Unlimited Pass (KES 20)", action: "buy_1hr" },
            { label: "24-Hour 3GB Pass (KES 50)", action: "buy_24hr" },
            { label: "30-Day Home Uncapped (KES 1,500)", action: "buy_30d" },
          ],
        };
      } else if (action.startsWith("buy_")) {
        const planName = action === "buy_1hr" ? "1-Hour Unlimited" : action === "buy_24hr" ? "24-Hour 3GB" : "30-Day Uncapped";
        const price = action === "buy_1hr" ? "KES 20" : action === "buy_24hr" ? "KES 50" : "KES 1,500";
        botResponse = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: `Payment of ${price} verified via M-Pesa (Ref: SK89201LKQ).\nHere is your hotspot login voucher:`,
          time: "10:25 AM",
          voucherCard: {
            code: "MKG-8829-V1",
            plan: planName,
            price: price,
          },
        };
      } else if (action === "outage") {
        botResponse = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: `Running automated line diagnostics on core router CCR2004...\n\n- Optical Signal Rx: -19.4 dBm (Normal)\n- PPPoE Server State: Active (0 drops in 24h)\n- Gateway Ping: 1.8 ms\n\nYour feeder cable is operational. If you are experiencing no connection, power-cycle your fiber ONT router for 30 seconds.`,
          time: "10:25 AM",
          options: [{ label: "Open Support Ticket with NOC Engineer", action: "engineer" }],
        };
      } else {
        botResponse = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: `Dispatching ticket #TK-9402 to on-duty NOC engineer Kelvin.\nHe will contact your phone number within 3 minutes. Thank you for your patience.`,
          time: "10:25 AM",
        };
      }

      setMessages((prev) => [...prev, botResponse]);
    }, 900);
  };

  const handleSendCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    handleAction("balance", inputText);
    setInputText("");
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Automation &amp; CRM</Badge>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>WhatsApp Cloud API Active</span>
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">
            Automated WhatsApp Self-Service Billing &amp; Voucher Bot
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Allow your fiber and wireless subscribers in Kenya to check balances, renew via M-Pesa STK, and report faults on WhatsApp without human staff intervention.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-slate-400">Response Latency:</span>
          <span className="font-bold text-emerald-400">&lt; 1.2s via Webhook</span>
        </div>
      </div>

      {/* Main Dual Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Smartphone WhatsApp Simulation */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-sm rounded-[32px] border-4 border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col h-[540px]">
            {/* Phone Top Notch / Bar */}
            <div className="bg-[#1f2c34] px-4 py-2.5 flex items-center justify-between border-b border-slate-800 text-white">
              <div className="flex items-center gap-2.5">
                <div className="relative h-9 w-9 rounded-full bg-gradient-to-br from-brand-600 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                  M
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#1f2c34]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1">
                    <span>MASHUPKGRID Fiber</span>
                    <span className="text-emerald-400 text-[10px]">✓</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">online · verified bot</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>⋮</span>
              </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 bg-[#0b141a] p-3.5 space-y-3 overflow-y-auto font-sans text-xs">
              <div className="text-center">
                <span className="bg-[#182229] text-[10px] text-slate-400 px-2.5 py-1 rounded-md font-mono">
                  Messages are end-to-end encrypted
                </span>
              </div>

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      m.sender === "user"
                        ? "bg-[#005c4b] text-white rounded-tr-none"
                        : "bg-[#202c33] text-slate-100 rounded-tl-none border border-slate-800/80"
                    }`}
                  >
                    <p className="whitespace-pre-line">{m.text}</p>

                    {/* Voucher Card preview inside chat */}
                    {m.voucherCard && (
                      <div className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-purple-500/40 text-left font-mono text-[11px] space-y-1">
                        <div className="text-purple-400 font-bold uppercase">{m.voucherCard.plan}</div>
                        <div className="text-base font-black text-white">{m.voucherCard.code}</div>
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>Amount Paid:</span>
                          <span className="text-emerald-400 font-bold">{m.voucherCard.price}</span>
                        </div>
                      </div>
                    )}

                    <div className="text-[9px] text-slate-400 text-right mt-1 font-mono">
                      {m.time} {m.sender === "user" && <span className="text-cyan-400">✓✓</span>}
                    </div>
                  </div>

                  {/* Interactive Quick Reply Buttons */}
                  {m.options && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[85%]">
                      {m.options.map((opt) => (
                        <button
                          key={opt.action}
                          onClick={() => handleAction(opt.action, opt.label)}
                          className="bg-[#202c33] hover:bg-[#2a3942] border border-emerald-500/40 text-emerald-300 text-[11px] font-medium px-2.5 py-1 rounded-full transition-all text-left shadow-sm active:scale-95"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-1.5 bg-[#202c33] text-slate-400 px-3 py-1.5 rounded-2xl w-24 text-[11px]">
                  <span className="animate-pulse">Typing</span>
                  <span className="animate-bounce">...</span>
                </div>
              )}
            </div>

            {/* Input Footer */}
            <form onSubmit={handleSendCustom} className="bg-[#1f2c34] p-2 flex items-center gap-2 border-t border-slate-800">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message or select above..."
                className="flex-1 bg-[#2a3942] border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                className="h-8 w-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shrink-0 transition-colors"
              >
                &rarr;
              </button>
            </form>
          </div>
        </div>

        {/* Right: Operator WhatsApp Cloud Console Specs */}
        <div className="lg:col-span-6 space-y-5 text-left font-sans">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <span>WhatsApp Business Cloud API Configuration</span>
              <span className="text-[10px] font-mono bg-emerald-950 border border-emerald-800 text-emerald-400 px-2 py-0.5 rounded">
                Verified
              </span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Connects directly to Meta WhatsApp Cloud API or Twilio WhatsApp. Fully integrated with your Safaricom Daraja M-Pesa Paybill and FreeRADIUS subscriber accounting database.
            </p>

            <div className="space-y-2.5 font-mono text-xs text-slate-300 pt-2">
              <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-500">Business WhatsApp Number:</span>
                <span className="text-white font-bold">+254 700 892 100</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-500">Webhook Endpoint:</span>
                <span className="text-brand-400 truncate">https://api.mashupkgrid.com/v1/whatsapp/webhook</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-500">STK Push Trigger:</span>
                <span className="text-emerald-400 font-bold">Daraja 2.0 Automatic</span>
              </div>
            </div>
          </div>

          {/* Operational Metrics */}
          <div className="grid grid-cols-2 gap-4 font-mono text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-1">
              <span className="text-slate-400 text-[11px] block">Chats Handled (Monthly)</span>
              <span className="text-2xl font-bold text-white">1,842</span>
              <span className="text-[10px] text-emerald-400 block">89% resolved without staff</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-1">
              <span className="text-slate-400 text-[11px] block">M-Pesa Collected via Bot</span>
              <span className="text-2xl font-bold text-emerald-400">KES 485K</span>
              <span className="text-[10px] text-slate-400 block">Zero manual Paybill entry</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-400 space-y-2">
            <div className="font-bold text-slate-300">Supported WhatsApp Bot Actions:</div>
            <ul className="space-y-1 list-disc pl-4 text-[11px]">
              <li>Instant M-Pesa STK push renewal &amp; automatic un-throttle on MikroTik</li>
              <li>Hotspot voucher PIN dispatch with printable PDF receipt</li>
              <li>Live line optical diagnostic (Rx dBm check) before dispatching technicians</li>
              <li>Automated outage broadcast notifications to affected subnet clusters</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
