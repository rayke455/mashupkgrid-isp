"use client";

import React, { useState } from "react";
import type { SupportTicket } from "../types";
import {
  PhoneIcon,
  MailIcon,
  MessageSquareIcon,
  AlertCircleIcon,
  CheckIcon,
  SpeedometerIcon,
  BillIcon,
  RouterIcon,
} from "../icons";

interface SupportViewProps {
  tickets: SupportTicket[];
  brandName?: string;
  supportPhone?: string;
  supportEmail?: string;
  onOpenNewTicketModal: (initialCategory?: string) => void;
  onOpenLiveChat: () => void;
}

export function SupportView({
  tickets,
  brandName = "FiberConnect",
  supportPhone = "1-800-555-0199",
  supportEmail = "support@fiberconnect.com",
  onOpenNewTicketModal,
  onOpenLiveChat,
}: SupportViewProps) {
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Header matching Screenshot */}
      <div className="px-1 pt-2">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Support &amp; Help Center
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          How can we assist you today?
        </p>

        {/* Operational Status Pill matching Screenshot */}
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
          <span>All Systems Operational</span>
        </div>
      </div>

      {/* 1. "WHAT DO YOU NEED HELP WITH?" CARD matching Screenshot */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4">
        <h3 className="text-base font-black text-slate-900 dark:text-white">
          What do you need help with?
        </h3>

        {/* 2x2 Quick Action Tiles */}
        <div className="grid grid-cols-2 gap-3">
          {/* No Connection */}
          <button
            type="button"
            onClick={() => onOpenNewTicketModal("Connection Problem")}
            className="p-4 rounded-2xl bg-slate-50 hover:bg-blue-50/70 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700/60 flex flex-col items-center justify-center text-center gap-2.5 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertCircleIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              No Connection
            </span>
          </button>

          {/* Slow Speed */}
          <button
            type="button"
            onClick={() => onOpenNewTicketModal("Slow Internet")}
            className="p-4 rounded-2xl bg-slate-50 hover:bg-blue-50/70 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700/60 flex flex-col items-center justify-center text-center gap-2.5 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <SpeedometerIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Slow Speed
            </span>
          </button>

          {/* Billing */}
          <button
            type="button"
            onClick={() => onOpenNewTicketModal("Billing Issue")}
            className="p-4 rounded-2xl bg-slate-50 hover:bg-blue-50/70 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700/60 flex flex-col items-center justify-center text-center gap-2.5 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <BillIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Billing
            </span>
          </button>

          {/* Equipment */}
          <button
            type="button"
            onClick={() => onOpenNewTicketModal("Equipment / Router")}
            className="p-4 rounded-2xl bg-slate-50 hover:bg-blue-50/70 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700/60 flex flex-col items-center justify-center text-center gap-2.5 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <RouterIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Equipment
            </span>
          </button>
        </div>

        {/* Report an Issue Button matching Screenshot */}
        <button
          type="button"
          onClick={() => onOpenNewTicketModal()}
          className="w-full h-12 py-3 px-4 rounded-2xl bg-[#090b4d] hover:bg-[#060835] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
        >
          <AlertCircleIcon className="w-4 h-4 text-white" />
          <span>Report an Issue</span>
        </button>
      </div>

      {/* 2. CONTACT US CARD matching Screenshot */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
          CONTACT US
        </span>

        {/* Call Support */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 shrink-0">
            <PhoneIcon className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Call Support</span>
            <a
              href={`tel:${supportPhone}`}
              className="text-sm font-black font-mono text-slate-900 dark:text-white hover:text-blue-600"
            >
              {supportPhone}
            </a>
            <span className="text-[10px] text-slate-400 block">24/7 Available</span>
          </div>
        </div>

        {/* Email Support */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 shrink-0">
            <MailIcon className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Email</span>
            <a
              href={`mailto:${supportEmail}`}
              className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-600"
            >
              {supportEmail}
            </a>
            <span className="text-[10px] text-slate-400 block">Usually replies in 2 hrs</span>
          </div>
        </div>

        {/* Support Representative Illustration banner */}
        <div className="pt-2">
          <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800/70 dark:to-indigo-950/40 p-4 border border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-black text-slate-900 dark:text-white block">
                Line Technicians on Standby
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Fiber optic field engineers ready for rapid dispatch.
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <span className="text-xl">👩‍💻</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. RECENT SUPPORT TICKETS matching Screenshot */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 dark:text-white">
            Recent Support Tickets
          </h3>
          <button
            type="button"
            onClick={() => onOpenNewTicketModal()}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            View All
          </button>
        </div>

        <div className="space-y-2.5">
          {tickets.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedTicket(t)}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between cursor-pointer hover:border-blue-500/40 transition-all"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    t.status === "OPEN"
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  <MessageSquareIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    #{t.id} - {t.subject}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Opened on {t.createdAt}
                  </span>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  t.status === "OPEN"
                    ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                }`}
              >
                {t.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  Ticket #{selectedTicket.id}
                </h4>
                <p className="text-xs text-slate-400">{selectedTicket.subject}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {selectedTicket.messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl text-xs ${
                    m.sender === "customer"
                      ? "bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 ml-6"
                      : "bg-slate-100 dark:bg-slate-800 mr-6"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
                    <span>{m.sender === "customer" ? "You" : "Fiber Support"}</span>
                    <span>{m.time}</span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200">{m.text}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedTicket(null);
                onOpenLiveChat();
              }}
              className="w-full py-3 rounded-2xl bg-[#090b4d] text-white font-bold text-xs"
            >
              Chat with Technician on this Ticket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
