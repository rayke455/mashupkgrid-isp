"use client";

import { useState } from "react";

interface ChartTableProps {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * The table behind a chart.
 *
 * Required rather than decorative: without it, per-point values in an SVG chart are reachable
 * only by hovering, which excludes anyone using a keyboard or a screen reader and anyone reading
 * a printout. It stays collapsed so it costs no space until someone wants the numbers.
 */
export function ChartTable({ columns, rows }: ChartTableProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
      >
        {open ? "Hide data table" : "Show data table"}
      </button>

      {open && (
        <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-obsidian-800">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-slate-50 dark:bg-obsidian-950">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-2.5 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-obsidian-800">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2.5 py-1 text-slate-600 dark:text-slate-300">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
