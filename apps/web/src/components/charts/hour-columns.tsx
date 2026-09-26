"use client";

import { useState } from "react";

/**
 * Payments per hour of the day as 24 thin columns: one hue for magnitude, a 2px gap between
 * columns, rounded data ends on the baseline, a hover readout, and a label every six hours so the
 * axis never crowds. Hit targets are the full column height, not just the bar.
 */
export function HourColumns({ hours, height = 140 }: { hours: { hour: number; payments: number }[]; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...hours.map((h) => h.payments));
  const label = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const shown = active !== null ? hours[active] : null;

  return (
    <figure className="w-full">
      <div className="mb-2 h-5 text-xs text-slate-400" aria-live="polite">
        {shown ? (
          <>
            <span className="font-medium text-slate-200">
              {label(shown.hour)}–{label((shown.hour + 1) % 24)}
            </span>{" "}
            · {shown.payments} payment{shown.payments === 1 ? "" : "s"}
          </>
        ) : (
          "Hover a column for the count"
        )}
      </div>
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setActive(null)} role="img" aria-label="Payments by hour of day">
        {hours.map((h, i) => {
          const pct = h.payments === 0 ? 0 : Math.max(3, (h.payments / max) * 100);
          return (
            <div
              key={h.hour}
              className="flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              tabIndex={0}
              aria-label={`${label(h.hour)}: ${h.payments} payments`}
            >
              <div
                className={`w-full rounded-t ${active === i ? "bg-brand-400" : "bg-brand-500"}`}
                style={{ height: `${pct}%`, minHeight: h.payments > 0 ? 3 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 h-px w-full bg-obsidian-700" />
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        {[0, 6, 12, 18].map((h) => (
          <span key={h}>{label(h)}</span>
        ))}
        <span>24:00</span>
      </div>
    </figure>
  );
}
