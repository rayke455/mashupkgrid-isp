/**
 * A clean axis maximum that still uses the plot.
 *
 * Rounding up to the next power of ten is the easy version and wastes most of the canvas: a peak
 * of 10.6 GB becomes a 20 GB axis, so the tallest column reaches barely half the plot height and
 * every difference between days is squashed into the lower half. Stepping through a finer ladder
 * of round numbers keeps ticks readable (1.2, 2.5, 8 — never 10.63) while leaving at most ~20%
 * headroom.
 */
const LADDER = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / magnitude;
  const step = LADDER.find((candidate) => mantissa <= candidate) ?? 10;
  return step * magnitude;
}
