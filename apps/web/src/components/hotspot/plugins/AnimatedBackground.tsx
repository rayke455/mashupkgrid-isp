"use client";

import React, { useEffect, useRef } from "react";
import { BackgroundFxConfig } from "@/lib/captive-portal-plugins/types";

export function AnimatedBackground({ config }: { config: BackgroundFxConfig }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!config.enabled || !canvasRef.current) return;
    if (config.effectType === "custom-media" || config.effectType === "gradient-shift") return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const numItems = Math.min(config.density || 35, 60);

    // Particle / Star / Bubble objects
    const items = Array.from({ length: numItems }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * (config.speed || 1),
      speedY: (Math.random() - 0.5) * (config.speed || 1) - (config.effectType === "floating-bubbles" ? 0.8 : 0),
      opacity: Math.random() * 0.7 + 0.2,
      pulseSpeed: Math.random() * 0.03 + 0.01,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      items.forEach((item) => {
        item.x += item.speedX;
        item.y += item.speedY;

        if (item.x < 0) item.x = width;
        if (item.x > width) item.x = 0;
        if (item.y < 0) item.y = height;
        if (item.y > height) item.y = 0;

        ctx.beginPath();
        if (config.effectType === "floating-bubbles") {
          ctx.arc(item.x, item.y, item.size * 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = config.color || "rgba(99, 102, 241, 0.4)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
          ctx.fill();
        } else if (config.effectType === "stars") {
          ctx.arc(item.x, item.y, item.size * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(Math.sin(Date.now() * item.pulseSpeed)) * 0.8 + 0.2})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = config.color || "#6366f1";
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // Particles
          ctx.arc(item.x, item.y, item.size * 2, 0, Math.PI * 2);
          ctx.fillStyle = config.color || "rgba(99, 102, 241, 0.6)";
          ctx.shadowBlur = 6;
          ctx.shadowColor = config.color || "#6366f1";
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // Draw subtle connecting web lines for particles
      if (config.effectType === "particles") {
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const dist = Math.hypot(items[i]!.x - items[j]!.x, items[i]!.y - items[j]!.y);
            if (dist < 110) {
              ctx.beginPath();
              ctx.moveTo(items[i]!.x, items[i]!.y);
              ctx.lineTo(items[j]!.x, items[j]!.y);
              ctx.strokeStyle = `rgba(99, 102, 241, ${0.18 * (1 - dist / 110)})`;
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          }
        }
      }

      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameId);
    };
  }, [config.enabled, config.effectType, config.density, config.speed, config.color]);

  if (!config.enabled) return null;

  if (config.effectType === "custom-media" && config.customMediaUrl) {
    if (config.mediaType === "video") {
      return (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="fixed inset-0 w-full h-full object-cover pointer-events-none z-0 opacity-40"
        >
          <source src={config.customMediaUrl} type="video/mp4" />
        </video>
      );
    }
    return (
      <div
        className="fixed inset-0 w-full h-full bg-cover bg-center pointer-events-none z-0 opacity-40"
        style={{ backgroundImage: `url(${config.customMediaUrl})` }}
      />
    );
  }

  if (config.effectType === "cyber-grid") {
    return (
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-25"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(99, 102, 241, 0.25) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.25) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />
    );
  }

  if (config.effectType === "gradient-shift") {
    return (
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-35 animate-gradient-shift"
        style={{
          background: "linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)",
          backgroundSize: "400% 400%",
        }}
      >
        <style jsx>{`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-gradient-shift {
            animation: gradientShift 15s ease infinite;
          }
        `}</style>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0 opacity-70"
    />
  );
}
