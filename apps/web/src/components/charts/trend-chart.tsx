"use client";

import { useState } from "react";
import { useChartWidth } from "./use-chart-width";
import { niceMax } from "./scale";

export interface TrendPoint {
  /** ISO date (YYYY-MM-DD) — used as the x label and the series key. */
  date: string;
  value: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  /** Renders a raw value for tooltips, the y-axis and the end label. */
  format: (value: number) => string;
  height?: number;
  /** Names what is plotted. A single series needs no legend box — the caption says it. */
  caption?: string;
}

const PAD = { top: 16, right: 56, bottom: 24, left: 8 };

/**
 * Change over time for a single measure: 2px line, 10%-opacity area wash, one end marker.
 *
 * Single series, so there is deliberately no legend — a one-swatch legend only restates the
 * caption. Only the endpoint is directly labelled; a number on every point is noise and goes
 * unread, so the axis and the hover tooltip carry the rest.
 */
export function TrendChart({ points, format, height = 200, caption }: TrendChartProps) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = height - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  // A single point has no span to divide by; centre it rather than dividing by zero.
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => PAD.left + (points.length > 1 ? i * stepX : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;
  const last = points[points.length - 1]!;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="viz" ref={ref}>
      <div className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={caption ?? "Trend over time"}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines: hairline, solid, one step off the surface — recessive by design. */}
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

          <path d={area} fill="var(--viz-series-1)" fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--viz-series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {active && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          )}

          {/* End marker: >=8px across, with a 2px surface ring so it stays legible on the line. */}
          <circle
            cx={x(points.length - 1)}
            cy={y(last.value)}
            r={4}
            fill="var(--viz-series-1)"
            stroke="var(--viz-surface)"
            strokeWidth={2}
          />
          {active && (
            <circle
              cx={x(hover!)}
              cy={y(active.value)}
              r={4}
              fill="var(--viz-series-1)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          )}

          {/* Hit targets are full-height bands, far bigger than the 8px marker they select.
              Clamped to the plot area: an unclamped band around the first point starts left of
              the SVG origin, so its outer half is clipped and the edge point is harder to hit
              than every other one. */}
          {points.map((p, i) => {
            const bandW = stepX || plotW;
            const rawX = x(i) - bandW / 2;
            const clampedX = Math.max(rawX, PAD.left);
            const clampedW = Math.min(rawX + bandW, PAD.left + plotW) - clampedX;
            return (
              <rect
                key={p.date}
                x={clampedX}
                y={PAD.top}
                width={Math.max(clampedW, 1)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            );
          })}

          {/* Axis text wears a text token, never the series colour. */}
          <text x={PAD.left + plotW + 8} y={y(max) + 4} className="fill-slate-400 text-[10px]">
            {format(max)}
          </text>
          <text
            x={PAD.left + plotW + 8}
            y={y(last.value) + 4}
            className="fill-slate-600 dark:fill-slate-300 text-[10px] font-semibold"
          >
            {format(last.value)}
          </text>
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-white shadow-xl"
            style={{ left: x(hover!), top: 0 }}
          >
            <span className="font-semibold">{active.date}</span> · {format(active.value)}
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{points[0]!.date}</span>
        <span>{last.date}</span>
      </div>
    </div>
  );
}
