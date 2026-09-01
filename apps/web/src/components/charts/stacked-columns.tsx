"use client";

import { useState } from "react";
import { useChartWidth } from "./use-chart-width";
import { niceMax } from "./scale";

export interface StackedColumn {
  date: string;
  /** Bottom segment (series 1). */
  primary: number;
  /** Top segment (series 2). */
  secondary: number;
}

interface StackedColumnsProps {
  columns: StackedColumn[];
  primaryLabel: string;
  secondaryLabel: string;
  format: (value: number) => string;
  height?: number;
}

// No x-axis labels are drawn (the footer carries the date range and the tooltip the exact day),
// so the bottom band is small on purpose rather than reserving space nothing renders into.
const PAD = { top: 16, right: 8, bottom: 8, left: 8 };
const MAX_BAR = 24;
/** Surface-coloured gap between the two segments — white does the separating, not a stroke. */
const SEGMENT_GAP = 2;

/**
 * Two-series magnitude over time as stacked columns.
 *
 * Replaces a chart that encoded the same measure twice: bars were painted with a gradient AND
 * recoloured once a day exceeded 70% of the maximum, so colour tracked rank rather than identity
 * — the reader saw two palettes for one series and a legend whose swatches matched neither.
 * Here colour means only "upload vs download", and it never changes with the value.
 */
export function StackedColumns({
  columns,
  primaryLabel,
  secondaryLabel,
  format,
  height = 200,
}: StackedColumnsProps) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (columns.length === 0) return null;

  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = height - PAD.top - PAD.bottom;
  const totals = columns.map((c) => c.primary + c.secondary);
  const max = niceMax(Math.max(...totals));
  const band = plotW / columns.length;
  // Capped, never filling its slot: the band's leftover is deliberate air between columns.
  const barW = Math.min(MAX_BAR, Math.max(band - 6, 3));
  const scale = (v: number) => (v / max) * plotH;
  const active = hover !== null ? columns[hover] : null;

  return (
    <div className="viz" ref={ref}>
      <div className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${primaryLabel} and ${secondaryLabel} per day`}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={PAD.top + plotH * t}
              y2={PAD.top + plotH * t}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          ))}

          {columns.map((col, i) => {
            const cx = PAD.left + band * i + band / 2;
            const x = cx - barW / 2;
            const baseline = PAD.top + plotH;
            const primaryH = scale(col.primary);
            const secondaryH = scale(col.secondary);
            // The gap is carved out of the lower segment so the stack's total height stays true
            // to the data rather than growing by the gap.
            const primaryDrawn = Math.max(primaryH - (secondaryH > 0 ? SEGMENT_GAP : 0), 0);
            const secondaryY = baseline - primaryH - secondaryH;

            return (
              <g key={col.date} onMouseEnter={() => setHover(i)}>
                {/* Top segment carries the 4px rounded data-end; the bottom stays square at the
                    baseline, which is where the stack is anchored. */}
                {secondaryH > 0 && (
                  <rect
                    x={x}
                    y={secondaryY}
                    width={barW}
                    height={secondaryH}
                    rx={4}
                    fill="var(--viz-series-2)"
                  />
                )}
                {primaryDrawn > 0 && (
                  <rect
                    x={x}
                    y={baseline - primaryDrawn}
                    width={barW}
                    height={primaryDrawn}
                    rx={secondaryH > 0 ? 0 : 4}
                    fill="var(--viz-series-1)"
                  />
                )}
                {/* Hit target spans the whole band, so hovering the gap still selects the day. */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                />
              </g>
            );
          })}

          <text x={PAD.left} y={PAD.top - 4} className="fill-slate-400 text-[10px]">
            {format(max)}
          </text>
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-white shadow-xl"
            style={{ left: PAD.left + band * hover! + band / 2, top: 0 }}
          >
            <p className="font-semibold">{active.date}</p>
            <p>
              {primaryLabel}: {format(active.primary)}
            </p>
            <p>
              {secondaryLabel}: {format(active.secondary)}
            </p>
          </div>
        )}
      </div>

      {/* Two series, so a legend is always present — identity never rests on colour memory. */}
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-series-1)" }} />
          {primaryLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-series-2)" }} />
          {secondaryLabel}
        </span>
        <span className="ml-auto text-[10px] text-slate-400">
          {columns[0]!.date} – {columns[columns.length - 1]!.date}
        </span>
      </div>
    </div>
  );
}
