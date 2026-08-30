"use client";

import React, { useEffect, useState } from "react";
import { NotificationConfig } from "@/lib/captive-portal-plugins/types";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
}

export function PortalNotifications({
  config,
  toasts,
  onDismiss,
}: {
  config: NotificationConfig;
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (!config.enabled || toasts.length === 0) return null;

  const positionClass =
    config.position === "bottom-center"
      ? "bottom-6 left-1/2 -translate-x-1/2"
      : config.position === "top-center"
      ? "top-6 left-1/2 -translate-x-1/2"
      : "top-6 right-6";

  return (
    <div className={`fixed ${positionClass} z-50 flex flex-col gap-2 pointer-events-auto max-w-sm w-full px-4`}>
      {toasts.map((toast) => {
        const bg =
          toast.type === "success"
            ? "bg-emerald-950/95 border-emerald-500/50 text-emerald-200"
            : toast.type === "error"
            ? "bg-rose-950/95 border-rose-500/50 text-rose-200"
            : toast.type === "warning"
            ? "bg-amber-950/95 border-amber-500/50 text-amber-200"
            : "bg-indigo-950/95 border-indigo-500/50 text-indigo-200";

        const icon =
          toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : toast.type === "warning" ? "⚠️" : "ℹ️";

        return (
          <div
            key={toast.id}
            className={`rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-xs animate-slide-up ${bg}`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold">{icon}</span>
              <span className="font-medium leading-relaxed">{toast.message}</span>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white px-1 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
