"use client";

export interface BarListItem {
  label: string;
  value: number;
  /** Optional second line under the label (e.g. a split of the total). */
  detail?: string;
}

interface BarListProps {
  items: BarListItem[];
  format: (value: number) => string;
}

/**
 * Ranked magnitude across a handful of named things — the form for "who used the most",
 * where the category names are the point and a column chart would turn them into rotated
 * axis labels nobody can read.
 *
 * Single series, so no legend and one colour: the bars encode magnitude, not identity, and
 * giving each row its own hue would imply a categorical meaning that is not in the data.
 */
export function BarList({ items, format }: BarListProps) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="viz space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
              {item.label}
            </span>
            {/* Value at the tip of the bar, in a text token — never the series colour. */}
            <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">
              {format(item.value)}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-obsidian-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                background: "var(--viz-series-1)",
              }}
            />
          </div>
          {item.detail && (
            <p className="mt-0.5 text-[10px] text-slate-400">{item.detail}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
