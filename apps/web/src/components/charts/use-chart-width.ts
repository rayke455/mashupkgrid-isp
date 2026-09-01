"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures a container so charts can render at real pixel dimensions.
 *
 * The alternative — a fixed viewBox scaled with preserveAspectRatio — scales the strokes and
 * text along with the geometry, so a 2px line becomes 3.4px on a wide screen and the axis labels
 * grow with the container. Measuring instead keeps every mark spec exact at any width.
 */
export function useChartWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
