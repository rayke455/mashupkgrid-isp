"use client";

import React, { useState } from "react";
import { MessageSquareIcon } from "../icons";

interface ChatModalProps {
  isOpen: boolean;
  brandName?: string;
  onClose: () => void;
}

export function ChatModal({
  isOpen,
  brandName = "FiberConnect",
  onClose,
}: ChatModalProps) {
  const [messages, setMessages] = useState<Array<{ sender: "user" | "agent"; text: string; time: string }>>([
    { sender: "agent", text: `Hello! Welcome to ${brandName} live customer support. How can I assist with your fiber connection or TV subscription today?`, time: "Just now" },
  ]);
  const [input, setInput] = useState("");

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input.trim();
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { sender: "user", text: userText, time }]);
    setInput("");

    // Simulated instant reply
    setTimeout(() => {
      let reply = "Thank you for reaching out. A line technician is reviewing your ONT optical signal.";
      if (userText.toLowerCase().includes("pay") || userText.toLowerCase().includes("mpesa")) {
        reply = "For instant M-Pesa renewal, you can use the Payments tab or Paybill 400200 with your account number.";
      } else if (userText.toLowerCase().includes("speed") || userText.toLowerCase().includes("slow")) {
        reply = "We have initiated a remote line refresh on your fiber port. Please restart your Wi-Fi router if speeds persist.";
      } else if (userText.toLowerCase().includes("tv")) {
        reply = "TV channel access updates automatically upon payment confirmation.";
      }
      setMessages((prev) => [...prev, { sender: "agent", text: reply, time: "Just now" }]);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:max-w-md h-[90vh] sm:h-[600px] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-[#090b4d] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 border border-blue-400 flex items-center justify-center text-lg">
              👩‍💻
            </div>
            <div>
              <h3 className="text-sm font-black">{brandName} Support</h3>
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Support Online 🟢
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50 dark:bg-slate-950">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-2xl text-xs shadow-sm ${
                  m.sender === "user"
                    ? "bg-[#090b4d] text-white rounded-br-none"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none"
                }`}
              >
                <p className="leading-relaxed">{m.text}</p>
                <span
                  className={`text-[9px] block mt-1 ${
                    m.sender === "user" ? "text-blue-200 text-right" : "text-slate-400"
                  }`}
                >
                  {m.time}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <input
            type="text"
            required
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message here..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-[#090b4d] text-white font-bold text-xs shadow-md"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
