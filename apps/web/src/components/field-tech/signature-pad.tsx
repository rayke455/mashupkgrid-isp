"use client";

import { useEffect, useRef, useState } from "react";

/** A finger or mouse signature box. `onChange` gets a PNG (base64, no prefix) or null when cleared. */
export function SignaturePad({ onChange, clearLabel }: { onChange: (pngBase64: string | null) => void; clearLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const url = canvasRef.current!.toDataURL("image/png");
    onChange(url.slice(url.indexOf(",") + 1));
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-lg border border-slate-300 bg-white dark:border-obsidian-700"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          setEmpty(false);
          const ctx = canvasRef.current!.getContext("2d")!;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current!.getContext("2d")!;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={finish}
        onPointerLeave={finish}
      />
      {!empty && (
        <button
          type="button"
          className="mt-1 text-xs text-slate-500 underline"
          onClick={() => {
            const c = canvasRef.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
