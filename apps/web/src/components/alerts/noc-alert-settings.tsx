"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { IconCheck, IconPulse, IconMpesa, IconRouter } from "@/components/icons";

interface AlertFeedItem {
  id: string;
  time: string;
  type: "PAYMENT" | "ROUTER_DOWN" | "FIBER_CUT";
  title: string;
  message: string;
  channel: "TELEGRAM" | "WHATSAPP";
}

export function NocAlertSettings() {
  const [telegramToken, setTelegramToken] = useState("bot7192834:AAHq_mkg_prod_bot_sec");
  const [telegramChatId, setTelegramChatId] = useState("-1002938472910");
  const [whatsappPhone, setWhatsappPhone] = useState("+254 700 123 456");
  const [alertPayments, setAlertPayments] = useState(true);
  const [alertRouterDown, setAlertRouterDown] = useState(true);
  const [alertFiberCut, setAlertFiberCut] = useState(true);
  const [testSent, setTestSent] = useState(false);

  const [alertFeed, setAlertFeed] = useState<AlertFeedItem[]>([
    {
      id: "1",
      time: "Just now",
      type: "PAYMENT",
      title: "💰 M-Pesa STK Payment Verified",
      message: "KES 3,500.00 received from Brian Kimani (0712***081) for Gold Home Fiber 50M. PPPoE CoA un-throttled in 1.4s.",
      channel: "TELEGRAM",
    },
    {
      id: "2",
      time: "14 mins ago",
      type: "ROUTER_DOWN",
      title: "🔴 MikroTik Gateway Down Alert",
      message: "Core router ELD-CCR2004-RFT failed 3 consecutive ICMP probes. 148 subscribers affected. NOC engineer dispatched.",
      channel: "WHATSAPP",
    },
    {
      id: "3",
      time: "42 mins ago",
      type: "FIBER_CUT",
      title: "⚡ AI Fiber Cut Detection",
      message: "Optical fault localized on Trunk-B (Waiyaki Way KM 4.28). 64 ONTs dropped concurrently.",
      channel: "TELEGRAM",
    },
  ]);

  const handleSendTestAlert = () => {
    setTestSent(true);
    const newAlert: AlertFeedItem = {
      id: Date.now().toString(),
      time: "Just now",
      type: "PAYMENT",
      title: "🔔 TEST NOC ALERT: FreeRADIUS AAA Active",
      message: "Ping latency to KIXP is 1.2ms. All MikroTik API REST endpoints are healthy. Webhooks delivering at 100%.",
      channel: "TELEGRAM",
    };
    setAlertFeed([newAlert, ...alertFeed]);
    setTimeout(() => setTestSent(false), 2500);
  };

  return (
    <Card className="p-6 lg:p-8 space-y-6 border-slate-800 bg-slate-950/90 shadow-2xl font-sans text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info">Automated Incident Response</Badge>
            <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono text-[10px]">
              Telegram &amp; WhatsApp Webhook Engine
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">
            Real-Time NOC Telegram &amp; WhatsApp Alert Dispatcher
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Receive instantaneous notifications directly to your phone when revenue lands or when core network infrastructure experiences faults.
          </p>
        </div>

        <button
          onClick={handleSendTestAlert}
          disabled={testSent}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-white transition-all flex items-center gap-2 shrink-0 shadow-lg"
        >
          {testSent ? <IconCheck size={14} className="text-emerald-400" /> : <span>🚀</span>}
          <span>{testSent ? "Test Alert Dispatched!" : "Dispatch Test NOC Alert"}</span>
        </button>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Left: Telegram Bot Configuration */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-sm flex items-center gap-2">
              <span>✈️</span>
              <span>Telegram NOC Bot Integration</span>
            </span>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
              Bot API 7.0
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="tg-token">Telegram Bot API Token</Label>
              <Input
                id="tg-token"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="tg-chat">Target Channel / Group Chat ID</Label>
              <Input
                id="tg-chat"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Right: WhatsApp Notification Gateway */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-sm flex items-center gap-2">
              <span>💬</span>
              <span>WhatsApp Direct Alert Webhook</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
              Meta Cloud API
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="wa-phone">On-Call Engineer WhatsApp Phone</Label>
              <Input
                id="wa-phone"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="pt-2 space-y-2">
              <span className="text-[11px] font-mono text-slate-400 block uppercase">Trigger Events</span>
              <div className="grid grid-cols-1 gap-2 text-xs text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertPayments}
                    onChange={(e) => setAlertPayments(e.target.checked)}
                    className="h-4 w-4 rounded text-brand-600"
                  />
                  <span>Safaricom M-Pesa Payments Received</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertRouterDown}
                    onChange={(e) => setAlertRouterDown(e.target.checked)}
                    className="h-4 w-4 rounded text-brand-600"
                  />
                  <span>MikroTik Router Reachability &amp; High CPU</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertFiberCut}
                    onChange={(e) => setAlertFiberCut(e.target.checked)}
                    className="h-4 w-4 rounded text-brand-600"
                  />
                  <span>AI Optical Outages &amp; Feeder Cable Faults</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Stream of Simulated Push Alerts */}
      <div className="space-y-3 pt-2">
        <span className="text-xs font-bold text-white uppercase tracking-wider block font-mono">
          Live NOC Dispatch Stream (Simulated Push Preview)
        </span>

        <div className="space-y-2.5">
          {alertFeed.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{item.title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                    {item.channel}
                  </span>
                </div>
                <p className="text-slate-300 font-sans">{item.message}</p>
              </div>

              <span className="text-[11px] font-mono text-slate-500 shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
