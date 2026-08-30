"use client";

import React from "react";
import { MascotCharacterId } from "@/lib/captive-portal-plugins/types";

interface MascotSvgProps {
  size?: number;
  className?: string;
}

export function SpeedyCheetahSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#cheetahGrad)" />
      {/* Ears */}
      <polygon points="25,25 32,8 45,22" fill="#d97706" stroke="#78350f" strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points="75,25 68,8 55,22" fill="#d97706" stroke="#78350f" strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points="28,23 33,12 41,21" fill="#fef3c7" />
      <polygon points="72,23 67,12 59,21" fill="#fef3c7" />
      {/* Head */}
      <circle cx="50" cy="52" r="34" fill="#f59e0b" stroke="#78350f" strokeWidth="2.5" />
      {/* Cheetah spots */}
      <circle cx="34" cy="38" r="2.5" fill="#78350f" />
      <circle cx="66" cy="38" r="2.5" fill="#78350f" />
      <circle cx="30" cy="50" r="2.5" fill="#78350f" />
      <circle cx="70" cy="50" r="2.5" fill="#78350f" />
      <circle cx="50" cy="30" r="2" fill="#78350f" />
      {/* Eyes with speed goggles */}
      <rect x="26" y="42" width="48" height="18" rx="9" fill="#0f172a" stroke="#06b6d4" strokeWidth="2" />
      <circle cx="38" cy="51" r="5.5" fill="#38bdf8" />
      <circle cx="40" cy="49" r="2" fill="#ffffff" />
      <circle cx="62" cy="51" r="5.5" fill="#38bdf8" />
      <circle cx="64" cy="49" r="2" fill="#ffffff" />
      {/* Tear lines */}
      <path d="M 33 58 Q 32 68 35 73" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 67 58 Q 68 68 65 73" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
      {/* Muzzle */}
      <ellipse cx="50" cy="67" rx="13" ry="9" fill="#fef3c7" stroke="#78350f" strokeWidth="1.5" />
      <polygon points="46,63 54,63 50,67" fill="#dc2626" />
      <path d="M 46 69 Q 50 73 54 69" stroke="#78350f" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Lightning Speed Badge */}
      <circle cx="50" cy="88" r="9" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M 50 81 L 46 88 L 49 88 L 48 95 L 54 87 L 51 87 Z" fill="#ffffff" />
      <defs>
        <radialGradient id="cheetahGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#fbbf24" stopOpacity="0.25" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function CyberCatSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#catGrad)" />
      {/* Cyber Ears */}
      <polygon points="20,28 26,10 44,24" fill="#a855f7" stroke="#3b0764" strokeWidth="2.5" />
      <polygon points="80,28 74,10 56,24" fill="#a855f7" stroke="#3b0764" strokeWidth="2.5" />
      <polygon points="24,25 28,15 39,23" fill="#ec4899" />
      <polygon points="76,25 72,15 61,23" fill="#ec4899" />
      {/* Cyber Head */}
      <circle cx="50" cy="52" r="33" fill="#c084fc" stroke="#3b0764" strokeWidth="2.5" />
      {/* Visor */}
      <path d="M 24 45 Q 50 40 76 45 L 74 58 Q 50 63 26 58 Z" fill="#0f172a" stroke="#ec4899" strokeWidth="2" />
      {/* Neon glowing cat eyes */}
      <ellipse cx="38" cy="51" rx="6" ry="3.5" fill="#06b6d4" />
      <ellipse cx="62" cy="51" rx="6" ry="3.5" fill="#06b6d4" />
      <circle cx="39" cy="50" r="1.5" fill="#ffffff" />
      <circle cx="63" cy="50" r="1.5" fill="#ffffff" />
      {/* Whiskers */}
      <line x1="16" y1="60" x2="30" y2="62" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="67" x2="30" y2="66" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" />
      <line x1="84" y1="60" x2="70" y2="62" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" />
      <line x1="84" y1="67" x2="70" y2="66" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" />
      {/* Nose and mouth */}
      <polygon points="48,66 52,66 50,69" fill="#ec4899" />
      <path d="M 45 71 Q 50 75 55 71" stroke="#3b0764" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Antenna */}
      <line x1="50" y1="19" x2="50" y2="9" stroke="#ec4899" strokeWidth="2.5" />
      <circle cx="50" cy="7" r="3.5" fill="#06b6d4" />
      <defs>
        <radialGradient id="catGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#a855f7" stopOpacity="0.3" />
          <stop offset="1" stopColor="#3b0764" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function TechRobotSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#robotGrad)" />
      {/* Antenna */}
      <line x1="50" y1="20" x2="50" y2="8" stroke="#38bdf8" strokeWidth="3" />
      <circle cx="50" cy="7" r="4.5" fill="#f43f5e" />
      {/* Robot Ears */}
      <rect x="16" y="42" width="7" height="18" rx="3.5" fill="#0284c7" stroke="#0c4a6e" strokeWidth="2" />
      <rect x="77" y="42" width="7" height="18" rx="3.5" fill="#0284c7" stroke="#0c4a6e" strokeWidth="2" />
      {/* Robot Head */}
      <rect x="22" y="20" width="56" height="52" rx="14" fill="#0ea5e9" stroke="#0c4a6e" strokeWidth="2.5" />
      {/* Screen Face */}
      <rect x="28" y="27" width="44" height="34" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
      {/* Pixel Eyes */}
      <rect x="36" y="36" width="9" height="9" rx="2" fill="#22c55e" />
      <rect x="55" y="36" width="9" height="9" rx="2" fill="#22c55e" />
      {/* Smile Matrix */}
      <path d="M 40 52 Q 50 57 60 52" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Chest & Wi-Fi Icon */}
      <path d="M 33 72 L 67 72 L 62 90 L 38 90 Z" fill="#0284c7" stroke="#0c4a6e" strokeWidth="2" />
      <circle cx="50" cy="83" r="1.5" fill="#ffffff" />
      <path d="M 46 80 Q 50 77 54 80" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id="robotGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#0ea5e9" stopOpacity="0.25" />
          <stop offset="1" stopColor="#0c4a6e" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function NinjaFoxSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#foxGrad)" />
      {/* Ears */}
      <polygon points="20,24 28,6 48,22" fill="#ea580c" stroke="#7c2d12" strokeWidth="2.5" />
      <polygon points="80,24 72,6 52,22" fill="#ea580c" stroke="#7c2d12" strokeWidth="2.5" />
      <polygon points="25,22 30,11 43,20" fill="#1e293b" />
      <polygon points="75,22 70,11 57,20" fill="#1e293b" />
      {/* Head */}
      <circle cx="50" cy="52" r="33" fill="#f97316" stroke="#7c2d12" strokeWidth="2.5" />
      {/* Ninja Headband */}
      <rect x="18" y="32" width="64" height="12" rx="4" fill="#0f172a" stroke="#dc2626" strokeWidth="1.5" />
      <circle cx="50" cy="38" r="4" fill="#dc2626" />
      <polygon points="50,35 52,40 48,40" fill="#ffffff" />
      {/* Fierce Eyes */}
      <path d="M 32 50 L 44 48 L 42 53 Z" fill="#ffffff" stroke="#7c2d12" strokeWidth="1.5" />
      <circle cx="39" cy="50" r="2" fill="#0f172a" />
      <path d="M 68 50 L 56 48 L 58 53 Z" fill="#ffffff" stroke="#7c2d12" strokeWidth="1.5" />
      <circle cx="61" cy="50" r="2" fill="#0f172a" />
      {/* Ninja Mask */}
      <path d="M 26 56 Q 50 68 74 56 L 68 78 Q 50 86 32 78 Z" fill="#1e293b" stroke="#7c2d12" strokeWidth="2" />
      <polygon points="48,58 52,58 50,62" fill="#0f172a" />
      <defs>
        <radialGradient id="foxGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#f97316" stopOpacity="0.25" />
          <stop offset="1" stopColor="#7c2d12" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function GamerPandaSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#pandaGrad)" />
      {/* Ears */}
      <circle cx="26" cy="22" r="12" fill="#0f172a" stroke="#000000" strokeWidth="2" />
      <circle cx="74" cy="22" r="12" fill="#0f172a" stroke="#000000" strokeWidth="2" />
      {/* Head */}
      <circle cx="50" cy="52" r="34" fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />
      {/* Eye Patches */}
      <ellipse cx="36" cy="46" rx="8.5" ry="11" transform="rotate(-15 36 46)" fill="#0f172a" />
      <ellipse cx="64" cy="46" rx="8.5" ry="11" transform="rotate(15 64 46)" fill="#0f172a" />
      {/* Gamer Eyes */}
      <circle cx="36" cy="46" r="3.5" fill="#22c55e" />
      <circle cx="37" cy="45" r="1.2" fill="#ffffff" />
      <circle cx="64" cy="46" r="3.5" fill="#22c55e" />
      <circle cx="65" cy="45" r="1.2" fill="#ffffff" />
      {/* Gaming Headset */}
      <path d="M 20 50 Q 20 18 50 18 Q 80 18 80 50" stroke="#6366f1" strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect x="14" y="42" width="10" height="20" rx="5" fill="#4f46e5" stroke="#0f172a" strokeWidth="2" />
      <rect x="76" y="42" width="10" height="20" rx="5" fill="#4f46e5" stroke="#0f172a" strokeWidth="2" />
      <path d="M 20 58 Q 28 72 40 70" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="42" cy="70" r="3" fill="#22c55e" />
      {/* Nose and mouth */}
      <ellipse cx="50" cy="61" rx="4.5" ry="3" fill="#0f172a" />
      <path d="M 45 66 Q 50 71 55 66" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id="pandaGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function SuperheroEagleSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#eagleGrad)" />
      {/* Cape */}
      <path d="M 22 45 L 12 85 L 34 80 Z" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
      <path d="M 78 45 L 88 85 L 66 80 Z" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
      {/* Head Feather Tuft */}
      <path d="M 50 14 Q 40 8 46 22" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M 50 14 Q 60 8 54 22" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Eagle Head */}
      <circle cx="50" cy="46" r="28" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5" />
      {/* Hero Mask */}
      <path d="M 28 42 Q 50 36 72 42 L 68 52 Q 50 48 32 52 Z" fill="#2563eb" stroke="#1e3a8a" strokeWidth="2" />
      {/* Sharp Eyes */}
      <circle cx="40" cy="46" r="3.5" fill="#facc15" />
      <circle cx="41" cy="45" r="1.5" fill="#000000" />
      <circle cx="60" cy="46" r="3.5" fill="#facc15" />
      <circle cx="61" cy="45" r="1.5" fill="#000000" />
      {/* Powerful Beak */}
      <polygon points="42,54 58,54 50,70" fill="#f59e0b" stroke="#78350f" strokeWidth="2" />
      <path d="M 44 54 Q 50 62 50 70" stroke="#78350f" strokeWidth="1.5" fill="none" />
      {/* Chest Shield */}
      <polygon points="50,74 62,78 50,92 38,78" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
      <text x="50" y="86" fontSize="9" fontWeight="900" textAnchor="middle" fill="#ffffff" fontFamily="sans-serif">M</text>
      <defs>
        <radialGradient id="eagleGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#ef4444" stopOpacity="0.25" />
          <stop offset="1" stopColor="#1e3a8a" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function RetroMouseSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#mouseGrad)" />
      {/* Big Round Ears */}
      <circle cx="26" cy="24" r="16" fill="#0f172a" stroke="#000000" strokeWidth="2" />
      <circle cx="74" cy="24" r="16" fill="#0f172a" stroke="#000000" strokeWidth="2" />
      <circle cx="26" cy="24" r="10" fill="#f43f5e" />
      <circle cx="74" cy="24" r="10" fill="#f43f5e" />
      {/* Head */}
      <circle cx="50" cy="54" r="30" fill="#0f172a" stroke="#000000" strokeWidth="2.5" />
      <ellipse cx="50" cy="62" rx="22" ry="16" fill="#fef08a" />
      {/* Eyes */}
      <ellipse cx="42" cy="46" rx="4.5" ry="9" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
      <ellipse cx="58" cy="46" rx="4.5" ry="9" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
      <circle cx="43" cy="48" r="2.5" fill="#000000" />
      <circle cx="57" cy="48" r="2.5" fill="#000000" />
      {/* Nose and Joyful Smile */}
      <ellipse cx="50" cy="58" rx="4.5" ry="3" fill="#000000" />
      <path d="M 40 64 Q 50 74 60 64" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" fill="#e11d48" />
      <defs>
        <radialGradient id="mouseGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#f43f5e" stopOpacity="0.25" />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function PirateParrotSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#parrotGrad)" />
      {/* Pirate Hat */}
      <path d="M 22 28 Q 50 12 78 28 L 84 38 Q 50 32 16 38 Z" fill="#0f172a" stroke="#eab308" strokeWidth="2" />
      <circle cx="50" cy="27" r="3" fill="#eab308" />
      {/* Parrot Head */}
      <circle cx="50" cy="50" r="28" fill="#ef4444" stroke="#7f1d1d" strokeWidth="2.5" />
      {/* Eye Patch */}
      <circle cx="40" cy="46" r="6" fill="#0f172a" stroke="#000000" strokeWidth="1.5" />
      <line x1="26" y1="36" x2="52" y2="52" stroke="#0f172a" strokeWidth="2" />
      {/* Normal Eye */}
      <circle cx="62" cy="46" r="6" fill="#ffffff" stroke="#7f1d1d" strokeWidth="1.5" />
      <circle cx="62" cy="46" r="3" fill="#000000" />
      <circle cx="63" cy="45" r="1" fill="#ffffff" />
      {/* Big Hooked Beak */}
      <path d="M 44 54 Q 65 54 58 72 Q 48 70 44 54 Z" fill="#f59e0b" stroke="#78350f" strokeWidth="2" />
      <defs>
        <radialGradient id="parrotGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#ef4444" stopOpacity="0.25" />
          <stop offset="1" stopColor="#7f1d1d" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function SoccerStarSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#soccerGrad)" />
      {/* Head */}
      <circle cx="50" cy="46" r="30" fill="#f59e0b" stroke="#78350f" strokeWidth="2.5" />
      {/* Headband */}
      <rect x="22" y="28" width="56" height="10" rx="4" fill="#22c55e" stroke="#14532d" strokeWidth="1.5" />
      {/* Athletic Eyes */}
      <circle cx="38" cy="44" r="4" fill="#0f172a" />
      <circle cx="39" cy="43" r="1.5" fill="#ffffff" />
      <circle cx="62" cy="44" r="4" fill="#0f172a" />
      <circle cx="63" cy="43" r="1.5" fill="#ffffff" />
      {/* Big Confident Smile */}
      <path d="M 40 56 Q 50 68 60 56" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" fill="#ffffff" />
      {/* Soccer Ball */}
      <circle cx="50" cy="80" r="15" fill="#ffffff" stroke="#000000" strokeWidth="2" />
      <polygon points="50,74 54,77 53,82 47,82 46,77" fill="#000000" />
      <defs>
        <radialGradient id="soccerGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#22c55e" stopOpacity="0.25" />
          <stop offset="1" stopColor="#14532d" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function AnimeFoxSvg({ size = 90, className = "" }: MascotSvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="50" cy="50" r="44" fill="url(#animeGrad)" />
      {/* Anime Fox Ears */}
      <polygon points="22,24 28,6 48,22" fill="#f43f5e" stroke="#881337" strokeWidth="2" />
      <polygon points="78,24 72,6 52,22" fill="#f43f5e" stroke="#881337" strokeWidth="2" />
      <polygon points="27,21 32,12 43,19" fill="#fecdd3" />
      <polygon points="73,21 68,12 57,19" fill="#fecdd3" />
      {/* Head */}
      <circle cx="50" cy="52" r="32" fill="#fb7185" stroke="#881337" strokeWidth="2.5" />
      {/* Huge Sparkly Anime Eyes */}
      <ellipse cx="36" cy="48" rx="8" ry="11" fill="#4c0519" />
      <circle cx="34" cy="44" r="3.5" fill="#ffffff" />
      <circle cx="38" cy="53" r="1.5" fill="#ffffff" />
      <ellipse cx="64" cy="48" rx="8" ry="11" fill="#4c0519" />
      <circle cx="62" cy="44" r="3.5" fill="#ffffff" />
      <circle cx="66" cy="53" r="1.5" fill="#ffffff" />
      {/* Cute Blush */}
      <ellipse cx="26" cy="58" rx="5" ry="3" fill="#fda4af" />
      <ellipse cx="74" cy="58" rx="5" ry="3" fill="#fda4af" />
      {/* Nose and tiny mouth */}
      <circle cx="50" cy="59" r="2" fill="#4c0519" />
      <path d="M 46 64 Q 50 68 54 64" stroke="#4c0519" strokeWidth="2" strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id="animeGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) rotate(90) scale(44)">
          <stop stopColor="#fb7185" stopOpacity="0.25" />
          <stop offset="1" stopColor="#881337" stopOpacity="0.05" />
        </radialGradient>
      </defs>
    </svg>
  );
}

import { CartoonCardBoySvg, Cartoon3DCharacterId } from "@/components/hotspot/themes/cartoon-mascot-card";

export function MascotRenderer({
  characterId,
  customImageUrl,
  size = 90,
  className = "",
}: {
  characterId: MascotCharacterId;
  customImageUrl?: string;
  size?: number;
  className?: string;
}) {
  if (characterId === "custom" && customImageUrl) {
    return (
      <img
        src={customImageUrl}
        alt="Custom Mascot"
        style={{ width: size, height: size, objectFit: "contain" }}
        className={className}
        loading="lazy"
      />
    );
  }

  switch (characterId) {
    case "speedy-cheetah":
      return <SpeedyCheetahSvg size={size} className={className} />;
    case "cyber-cat":
      return <CyberCatSvg size={size} className={className} />;
    case "tech-robot":
      return <TechRobotSvg size={size} className={className} />;
    case "ninja-fox":
      return <NinjaFoxSvg size={size} className={className} />;
    case "gamer-panda":
      return <GamerPandaSvg size={size} className={className} />;
    case "superhero-eagle":
      return <SuperheroEagleSvg size={size} className={className} />;
    case "retro-mouse":
      return <RetroMouseSvg size={size} className={className} />;
    case "pirate-parrot":
      return <PirateParrotSvg size={size} className={className} />;
    case "soccer-star":
      return <SoccerStarSvg size={size} className={className} />;
    case "anime-fox":
      return <AnimeFoxSvg size={size} className={className} />;
    default:
      return <CartoonCardBoySvg characterId={characterId as Cartoon3DCharacterId} size={size} className={className} />;
  }
}
