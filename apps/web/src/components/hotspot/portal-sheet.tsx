"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The captive portal's dialogs (pay, voucher, account, support, recovery). A bottom sheet on a
 * phone — thumb-reachable, and the keyboard pushes it up rather than covering it — and a centred
 * card on anything wider. Light and theme-neutral, so it reads the same over every portal theme.
 */
export function PortalSheet({
  title,
  description,
  children,
  onClose,
  zIndex = "z-50",
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  zIndex?: string;
}) {
  // Rendered into <body>: inside the portal's content wrapper a sheet can't stack above the
  // plugin bars (language, announcements), which then float bright over the dimmed backdrop.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className={`fixed inset-0 ${zIndex} flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-6 text-slate-900 shadow-2xl [color-scheme:light] sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        {title && <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>}
        {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
        <div className={title || description ? "mt-4" : ""}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

export const sheetLabel = "mb-1.5 block text-sm font-medium text-slate-700";
export const sheetInput =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10";
export const sheetPrimary =
  "w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
export const sheetSecondary = "w-full rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100";

export function SheetError({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{children}</p>;
}
