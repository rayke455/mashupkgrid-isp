"use client";

import React, { useState, useEffect } from "react";
import { MascotConfig, MascotAnimation } from "@/lib/captive-portal-plugins/types";
import { MascotRenderer } from "./MascotGallery";
import { portalSoundEngine } from "@/lib/captive-portal-plugins/sound-effects";

interface EdgeMascotsProps {
  mascots: MascotConfig[];
  masterEnabled: boolean;
  soundEnabled?: boolean;
  isInteractivePreview?: boolean;
  onMascotPositionChange?: (id: string, xPercent: number, yPercent: number) => void;
}

export function EdgeMascots({
  mascots,
  masterEnabled,
  soundEnabled = true,
  isInteractivePreview = false,
  onMascotPositionChange,
}: EdgeMascotsProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!masterEnabled || !mascots || mascots.length === 0) {
    return null;
  }

  const getAnimationClass = (animation: MascotAnimation) => {
    switch (animation) {
      case "float":
        return "animate-mascot-float";
      case "bounce":
        return "animate-mascot-bounce";
      case "wiggle":
        return "animate-mascot-wiggle";
      case "shake":
        return "animate-mascot-shake";
      case "swing":
        return "animate-mascot-swing";
      case "pulse":
        return "animate-mascot-pulse";
      case "rotate":
        return "animate-mascot-rotate";
      case "slide":
        return "animate-mascot-slide";
      case "fade":
        return "animate-mascot-fade";
      case "random":
        return "animate-mascot-float";
      default:
        return "animate-mascot-float";
    }
  };

  const getZoneStyle = (mascot: MascotConfig): React.CSSProperties => {
    const size = isMobile ? mascot.mobileSizePx : mascot.sizePx;
    const xOffset = isMobile ? (mascot.mobileXOffsetPercent ?? mascot.xOffsetPercent ?? 2) : (mascot.xOffsetPercent ?? 2);
    const yOffset = isMobile ? (mascot.mobileYOffsetPercent ?? mascot.yOffsetPercent ?? 2) : (mascot.yOffsetPercent ?? 2);

    const style: React.CSSProperties = {
      position: "fixed",
      zIndex: isInteractivePreview ? 50 : 20,
      opacity: mascot.opacity,
      transform: `rotate(${mascot.rotationDeg}deg)`,
      transition: draggedId === mascot.id ? "none" : "transform 0.3s ease, opacity 0.3s ease",
      animationDuration: `${mascot.animationSpeedSec}s`,
      pointerEvents: isInteractivePreview ? "auto" : "auto",
      cursor: isInteractivePreview ? "grab" : "pointer",
    };

    switch (mascot.zone) {
      case "top-left":
        style.top = `${yOffset}%`;
        style.left = `${xOffset}%`;
        break;
      case "top-right":
        style.top = `${yOffset}%`;
        style.right = `${xOffset}%`;
        break;
      case "left-center":
        style.top = `${yOffset}%`;
        style.left = `${xOffset}%`;
        style.transform += " translateY(-50%)";
        break;
      case "right-center":
        style.top = `${yOffset}%`;
        style.right = `${xOffset}%`;
        style.transform += " translateY(-50%)";
        break;
      case "bottom-left":
        style.bottom = `${yOffset}%`;
        style.left = `${xOffset}%`;
        break;
      case "bottom-right":
        style.bottom = `${yOffset}%`;
        style.right = `${xOffset}%`;
        break;
    }

    return style;
  };

  const handleMascotClick = (mascot: MascotConfig) => {
    if (soundEnabled) {
      portalSoundEngine.playMascotGreeting(0.6);
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-20">
      <style jsx global>{`
        @keyframes mascotFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(3deg); }
        }
        @keyframes mascotBounce {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-16px) scale(1.05); }
        }
        @keyframes mascotWiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-8deg); }
          75% { transform: rotate(8deg); }
        }
        @keyframes mascotShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes mascotSwing {
          0%, 100% { transform: rotate(0deg); transform-origin: top center; }
          50% { transform: rotate(12deg); transform-origin: top center; }
        }
        @keyframes mascotPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 10px rgba(99, 102, 241, 0.6)); }
        }
        @keyframes mascotRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes mascotSlide {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(14px); }
        }
        @keyframes mascotFade {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 0.4; }
        }
        .animate-mascot-float { animation: mascotFloat 3.5s ease-in-out infinite; }
        .animate-mascot-bounce { animation: mascotBounce 2.8s cubic-bezier(0.28, 0.84, 0.42, 1) infinite; }
        .animate-mascot-wiggle { animation: mascotWiggle 3.2s ease-in-out infinite; }
        .animate-mascot-shake { animation: mascotShake 4.0s ease-in-out infinite; }
        .animate-mascot-swing { animation: mascotSwing 3.6s ease-in-out infinite; }
        .animate-mascot-pulse { animation: mascotPulse 2.5s ease-in-out infinite; }
        .animate-mascot-rotate { animation: mascotRotate 10s linear infinite; }
        .animate-mascot-slide { animation: mascotSlide 3.4s ease-in-out infinite; }
        .animate-mascot-fade { animation: mascotFade 3s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .animate-mascot-float,
          .animate-mascot-bounce,
          .animate-mascot-wiggle,
          .animate-mascot-shake,
          .animate-mascot-swing,
          .animate-mascot-pulse,
          .animate-mascot-rotate,
          .animate-mascot-slide,
          .animate-mascot-fade {
            animation: none !important;
          }
        }
      `}</style>

      {mascots
        .filter((m) => m.enabled && (!isMobile || !m.hideOnMobile))
        .map((mascot) => {
          const size = isMobile ? mascot.mobileSizePx : mascot.sizePx;
          const animClass = getAnimationClass(mascot.animation);

          return (
            <div
              key={mascot.id}
              style={getZoneStyle(mascot)}
              onClick={() => handleMascotClick(mascot)}
              className="pointer-events-auto select-none group"
              title={`${mascot.name} — Click to interact`}
            >
              <div
                className={`${animClass} transition-transform group-hover:scale-115 group-active:scale-95 duration-200 filter drop-shadow-xl hover:drop-shadow-2xl`}
              >
                <MascotRenderer
                  characterId={mascot.characterId}
                  customImageUrl={mascot.customImageUrl}
                  size={size}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
}
