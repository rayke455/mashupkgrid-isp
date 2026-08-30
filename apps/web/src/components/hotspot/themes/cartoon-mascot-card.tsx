"use client";

import React from "react";

export type Cartoon3DCharacterId =
  | "yellow-boy"
  | "tom-cat"
  | "jerry-mouse"
  | "spongebob"
  | "ben-10"
  | "spider-hero"
  | "mickey-mouse"
  | "bugs-bunny"
  | "wendy-girl"
  | "sonic-speed"
  | "electric-mouse"
  | "super-plumber"
  | "ninja-shinobi"
  | "saiyan-warrior"
  | "dark-knight"
  | "iron-avenger"
  | "green-ogre"
  | "yellow-minion"
  | "blue-robot-cat"
  | "spinach-sailor"
  | "mystery-dog"
  | "savanna-lion"
  | "kung-fu-panda"
  | "sailor-duck"
  | "pink-starfish"
  | "ninja-turtle"
  | "cyber-android"
  | "cyber-girl"
  | "speedy-cheetah"
  | "space-astronaut";

export interface CartoonCharacterMeta {
  id: Cartoon3DCharacterId;
  name: string;
  category: "Classic Toon" | "Superhero" | "Anime & Gaming" | "Adventure";
  themeColor: string;
}

export const CARTOON_3D_CATALOG: CartoonCharacterMeta[] = [
  { id: "yellow-boy", name: "Yellow Hoodie Boy (Screenshot Match)", category: "Adventure", themeColor: "#eab308" },
  { id: "tom-cat", name: "Tom (Blue-Grey Cat)", category: "Classic Toon", themeColor: "#64748b" },
  { id: "jerry-mouse", name: "Jerry (Brown Mouse)", category: "Classic Toon", themeColor: "#d97706" },
  { id: "spongebob", name: "SpongeBob (Sea Sponge)", category: "Classic Toon", themeColor: "#facc15" },
  { id: "ben-10", name: "Ben 10 (Omnitrix Hero)", category: "Superhero", themeColor: "#22c55e" },
  { id: "spider-hero", name: "Spider Hero (Web Slinger)", category: "Superhero", themeColor: "#ef4444" },
  { id: "mickey-mouse", name: "Mickey (Round-Eared Mouse)", category: "Classic Toon", themeColor: "#e11d48" },
  { id: "bugs-bunny", name: "Bugs Bunny (Carrot Rabbit)", category: "Classic Toon", themeColor: "#94a3b8" },
  { id: "wendy-girl", name: "Wendy (Explorer Girl)", category: "Adventure", themeColor: "#f43f5e" },
  { id: "sonic-speed", name: "Sonic (Speed Hedgehog)", category: "Anime & Gaming", themeColor: "#2563eb" },
  { id: "electric-mouse", name: "Pikachu (Electric Rodent)", category: "Anime & Gaming", themeColor: "#eab308" },
  { id: "super-plumber", name: "Mario (Red Cap Plumber)", category: "Anime & Gaming", themeColor: "#dc2626" },
  { id: "ninja-shinobi", name: "Naruto (Shinobi Ninja)", category: "Anime & Gaming", themeColor: "#f97316" },
  { id: "saiyan-warrior", name: "Goku (Golden Saiyan)", category: "Anime & Gaming", themeColor: "#f59e0b" },
  { id: "dark-knight", name: "Batman (Dark Knight)", category: "Superhero", themeColor: "#1e293b" },
  { id: "iron-avenger", name: "Iron Avenger (Armor Tech)", category: "Superhero", themeColor: "#b91c1c" },
  { id: "green-ogre", name: "Shrek (Friendly Ogre)", category: "Adventure", themeColor: "#65a30d" },
  { id: "yellow-minion", name: "Minion (One-Eye Capsule)", category: "Classic Toon", themeColor: "#facc15" },
  { id: "blue-robot-cat", name: "Doraemon (Pocket Cat)", category: "Anime & Gaming", themeColor: "#0284c7" },
  { id: "spinach-sailor", name: "Popeye (Sailor Man)", category: "Classic Toon", themeColor: "#0369a1" },
  { id: "mystery-dog", name: "Scooby (Detective Dog)", category: "Classic Toon", themeColor: "#78350f" },
  { id: "savanna-lion", name: "Simba (Savanna Lion King)", category: "Adventure", themeColor: "#d97706" },
  { id: "kung-fu-panda", name: "Po (Kung Fu Panda)", category: "Anime & Gaming", themeColor: "#0f172a" },
  { id: "sailor-duck", name: "Donald (Sailor Duck)", category: "Classic Toon", themeColor: "#0284c7" },
  { id: "pink-starfish", name: "Patrick (Pink Starfish)", category: "Classic Toon", themeColor: "#f43f5e" },
  { id: "ninja-turtle", name: "Ninja Turtle (Green Hero)", category: "Superhero", themeColor: "#16a34a" },
  { id: "cyber-android", name: "Mega Man (Blue Android)", category: "Anime & Gaming", themeColor: "#0284c7" },
  { id: "cyber-girl", name: "Cyber Girl (Neon Visor)", category: "Anime & Gaming", themeColor: "#c084fc" },
  { id: "speedy-cheetah", name: "Speedy Cheetah (Goggles)", category: "Adventure", themeColor: "#f59e0b" },
  { id: "space-astronaut", name: "Cosmic Astronaut (Explorer)", category: "Adventure", themeColor: "#38bdf8" },
];

/**
 * 100% Transparent 3D Cartoon Character Cutout
 * Character leans forward with hands gripping the top edge of the package card.
 * Zero background boxes or frames.
 */
export function CartoonCardBoySvg({
  characterId = "yellow-boy",
  className = "",
  size = 58,
}: {
  characterId?: Cartoon3DCharacterId;
  className?: string;
  size?: number;
}) {
  switch (characterId) {
    case "tom-cat":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* Blue-Grey Cat Head & Ears */}
          <polygon points="18,34 26,10 44,26" fill="#64748b" stroke="#334155" strokeWidth="2.5" />
          <polygon points="82,34 74,10 56,26" fill="#64748b" stroke="#334155" strokeWidth="2.5" />
          <polygon points="23,30 28,16 39,24" fill="#fda4af" />
          <polygon points="77,30 72,16 61,24" fill="#fda4af" />
          <ellipse cx="50" cy="46" rx="34" ry="28" fill="#64748b" stroke="#334155" strokeWidth="2.5" />
          {/* White Muzzle */}
          <ellipse cx="50" cy="56" rx="20" ry="14" fill="#f8fafc" />
          {/* Big Yellow-Green Cat Eyes */}
          <ellipse cx="38" cy="38" rx="7" ry="9" fill="#fef08a" stroke="#334155" strokeWidth="1.5" />
          <ellipse cx="62" cy="38" rx="7" ry="9" fill="#fef08a" stroke="#334155" strokeWidth="1.5" />
          <ellipse cx="40" cy="39" rx="3.5" ry="5.5" fill="#16a34a" />
          <ellipse cx="60" cy="39" rx="3.5" ry="5.5" fill="#16a34a" />
          <circle cx="41" cy="37" r="1.5" fill="#ffffff" />
          <circle cx="59" cy="37" r="1.5" fill="#ffffff" />
          {/* Pink Nose & Whiskers */}
          <polygon points="46,48 54,48 50,53" fill="#f43f5e" />
          <path d="M 42 58 Q 50 64 58 58" stroke="#334155" strokeWidth="2" strokeLinecap="round" fill="none" />
          <line x1="12" y1="52" x2="30" y2="54" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="60" x2="30" y2="58" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="88" y1="52" x2="70" y2="54" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="88" y1="60" x2="70" y2="58" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
          {/* White Paws Resting on Card Edge */}
          <ellipse cx="26" cy="74" rx="9" ry="6.5" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
          <ellipse cx="74" cy="74" rx="9" ry="6.5" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
        </svg>
      );

    case "jerry-mouse":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* Jerry Big Round Ears */}
          <circle cx="22" cy="22" r="18" fill="#b45309" stroke="#78350f" strokeWidth="2.5" />
          <circle cx="78" cy="22" r="18" fill="#b45309" stroke="#78350f" strokeWidth="2.5" />
          <circle cx="22" cy="22" r="11" fill="#fbcfe8" />
          <circle cx="78" cy="22" r="11" fill="#fbcfe8" />
          <circle cx="50" cy="48" r="28" fill="#d97706" stroke="#78350f" strokeWidth="2.5" />
          <ellipse cx="50" cy="56" rx="20" ry="14" fill="#fef3c7" />
          {/* Cheerful Eyes */}
          <ellipse cx="40" cy="40" rx="5" ry="8" fill="#ffffff" stroke="#78350f" strokeWidth="1.5" />
          <ellipse cx="60" cy="40" rx="5" ry="8" fill="#ffffff" stroke="#78350f" strokeWidth="1.5" />
          <circle cx="41" cy="41" r="3" fill="#000000" />
          <circle cx="59" cy="41" r="3" fill="#000000" />
          {/* Nose & Big Smile */}
          <ellipse cx="50" cy="50" rx="4" ry="2.5" fill="#000000" />
          <path d="M 40 58 Q 50 68 60 58" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" fill="#e11d48" />
          {/* Paws Resting on Card */}
          <ellipse cx="28" cy="74" rx="7" ry="5.5" fill="#fed7aa" stroke="#78350f" strokeWidth="1.5" />
          <ellipse cx="72" cy="74" rx="7" ry="5.5" fill="#fed7aa" stroke="#78350f" strokeWidth="1.5" />
        </svg>
      );

    case "spongebob":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* SpongeBob Square Body */}
          <rect x="22" y="16" width="56" height="52" rx="8" fill="#facc15" stroke="#854d0e" strokeWidth="2.5" />
          <circle cx="28" cy="24" r="3" fill="#ca8a04" opacity="0.6" />
          <circle cx="72" cy="26" r="3.5" fill="#ca8a04" opacity="0.6" />
          <circle cx="30" cy="56" r="2.5" fill="#ca8a04" opacity="0.6" />
          <circle cx="70" cy="58" r="3.5" fill="#ca8a04" opacity="0.6" />
          {/* Big Blue Eyes */}
          <circle cx="40" cy="36" r="8.5" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <circle cx="60" cy="36" r="8.5" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <circle cx="41" cy="36" r="4" fill="#38bdf8" />
          <circle cx="59" cy="36" r="4" fill="#38bdf8" />
          <circle cx="42" cy="36" r="2" fill="#000000" />
          <circle cx="58" cy="36" r="2" fill="#000000" />
          {/* Long Nose */}
          <ellipse cx="50" cy="40" rx="3.5" ry="6" fill="#facc15" stroke="#854d0e" strokeWidth="1.5" />
          {/* Big Smile & Two Front Buck Teeth */}
          <path d="M 32 46 Q 50 60 68 46" stroke="#854d0e" strokeWidth="2" fill="#e11d48" />
          <rect x="44" y="50" width="5" height="5" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
          <rect x="51" y="50" width="5" height="5" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
          {/* White Shirt Collar & Red Tie */}
          <rect x="22" y="68" width="56" height="10" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <polygon points="50,68 46,76 50,86 54,76" fill="#dc2626" />
          {/* Hands Resting on Card */}
          <circle cx="18" cy="74" r="6" fill="#facc15" stroke="#854d0e" strokeWidth="1.5" />
          <circle cx="82" cy="74" r="6" fill="#facc15" stroke="#854d0e" strokeWidth="1.5" />
        </svg>
      );

    case "ben-10":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* Ben 10 Torso with White & Black Shirt */}
          <path d="M 28 66 C 28 58, 72 58, 72 66 L 75 90 L 25 90 Z" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          <rect x="45" y="60" width="10" height="30" fill="#000000" />
          {/* Head & Spiky Hair */}
          <ellipse cx="50" cy="44" rx="22" ry="20" fill="#ffdfba" stroke="#78350f" strokeWidth="1.5" />
          <path d="M 26 36 C 26 14, 74 14, 74 36 C 68 22, 58 24, 50 18 C 42 24, 32 22, 26 36 Z" fill="#5c381a" />
          {/* Green Eyes */}
          <circle cx="41" cy="42" r="4.5" fill="#22c55e" stroke="#14532d" strokeWidth="1" />
          <circle cx="59" cy="42" r="4.5" fill="#22c55e" stroke="#14532d" strokeWidth="1" />
          <circle cx="42" cy="41" r="1.5" fill="#000000" />
          <circle cx="58" cy="41" r="1.5" fill="#000000" />
          {/* Confident Smile */}
          <path d="M 45 52 Q 52 56 57 52" stroke="#78350f" strokeWidth="2" strokeLinecap="round" fill="none" />
          {/* Hands Resting on Card + Omnitrix */}
          <ellipse cx="28" cy="74" rx="6.5" ry="5" fill="#ffdfba" stroke="#78350f" strokeWidth="1.2" />
          <ellipse cx="72" cy="74" rx="6.5" ry="5" fill="#ffdfba" stroke="#78350f" strokeWidth="1.2" />
          <circle cx="28" cy="68" r="5" fill="#1e293b" stroke="#22c55e" strokeWidth="1.5" />
          <polygon points="28,65 31,68 28,71 25,68" fill="#22c55e" />
        </svg>
      );

    case "spider-hero":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* Spider-Man Mask */}
          <ellipse cx="50" cy="46" rx="30" ry="34" fill="#dc2626" stroke="#991b1b" strokeWidth="2.5" />
          {/* Web Lines */}
          <line x1="50" y1="12" x2="50" y2="80" stroke="#000000" strokeWidth="1.2" opacity="0.6" />
          <line x1="20" y1="46" x2="80" y2="46" stroke="#000000" strokeWidth="1.2" opacity="0.6" />
          <line x1="28" y1="24" x2="72" y2="68" stroke="#000000" strokeWidth="1.2" opacity="0.6" />
          <line x1="72" y1="24" x2="28" y2="68" stroke="#000000" strokeWidth="1.2" opacity="0.6" />
          {/* Big White Angular Eyes */}
          <polygon points="30,36 45,44 36,54" fill="#ffffff" stroke="#000000" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="70,36 55,44 64,54" fill="#ffffff" stroke="#000000" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Red Gloved Hands on Card */}
          <ellipse cx="26" cy="74" rx="7.5" ry="5.5" fill="#dc2626" stroke="#991b1b" strokeWidth="1.5" />
          <ellipse cx="74" cy="74" rx="7.5" ry="5.5" fill="#dc2626" stroke="#991b1b" strokeWidth="1.5" />
        </svg>
      );

    case "bugs-bunny":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* Bugs Bunny Tall Ears */}
          <ellipse cx="36" cy="20" rx="7" ry="18" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
          <ellipse cx="36" cy="20" rx="3.5" ry="12" fill="#fbcfe8" />
          <ellipse cx="64" cy="20" rx="7" ry="18" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
          <ellipse cx="64" cy="20" rx="3.5" ry="12" fill="#fbcfe8" />
          {/* Head */}
          <ellipse cx="50" cy="50" rx="26" ry="24" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
          <ellipse cx="50" cy="58" rx="18" ry="14" fill="#ffffff" />
          {/* Eyes */}
          <ellipse cx="42" cy="40" rx="4.5" ry="8" fill="#ffffff" stroke="#000000" strokeWidth="1" />
          <ellipse cx="58" cy="40" rx="4.5" ry="8" fill="#ffffff" stroke="#000000" strokeWidth="1" />
          <circle cx="43" cy="41" r="2.5" fill="#000000" />
          <circle cx="57" cy="41" r="2.5" fill="#000000" />
          {/* Nose, Mouth, Buck Teeth */}
          <ellipse cx="50" cy="52" rx="3.5" ry="2.5" fill="#f43f5e" />
          <path d="M 44 58 Q 50 64 56 58" stroke="#000000" strokeWidth="2" fill="none" />
          <rect x="47" y="58" width="3" height="5" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
          <rect x="50" y="58" width="3" height="5" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
          {/* Carrot & Paws */}
          <polygon points="68,64 86,76 78,80" fill="#f97316" stroke="#c2410c" strokeWidth="1" />
          <ellipse cx="28" cy="74" rx="7" ry="5" fill="#ffffff" stroke="#475569" strokeWidth="1.5" />
          <ellipse cx="72" cy="74" rx="7" ry="5" fill="#ffffff" stroke="#475569" strokeWidth="1.5" />
        </svg>
      );

    case "wendy-girl":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* Wendy Girl with Pink Cap and Braids */}
          <ellipse cx="50" cy="44" rx="22" ry="20" fill="#ffdfba" stroke="#78350f" strokeWidth="1.5" />
          {/* Hair & Braids */}
          <path d="M 26 36 C 26 18, 74 18, 74 36 C 68 24, 32 24, 26 36 Z" fill="#9a3412" />
          <ellipse cx="22" cy="54" rx="5" ry="10" fill="#9a3412" />
          <ellipse cx="78" cy="54" rx="5" ry="10" fill="#9a3412" />
          {/* Pink Cap */}
          <path d="M 28 28 C 28 14, 72 14, 72 28 Z" fill="#f43f5e" stroke="#9f1239" strokeWidth="1.5" />
          <path d="M 24 29 Q 50 22 76 29 L 73 33 Q 50 26 27 33 Z" fill="#be123c" />
          {/* Big Anime Eyes */}
          <ellipse cx="40" cy="42" rx="5.5" ry="7" fill="#1e1b4b" />
          <ellipse cx="60" cy="42" rx="5.5" ry="7" fill="#1e1b4b" />
          <circle cx="39" cy="40" r="2" fill="#ffffff" />
          <circle cx="59" cy="40" r="2" fill="#ffffff" />
          {/* Smile & Rosy Blush */}
          <ellipse cx="32" cy="46" rx="3.5" ry="2" fill="#f43f5e" opacity="0.6" />
          <ellipse cx="68" cy="46" rx="3.5" ry="2" fill="#f43f5e" opacity="0.6" />
          <path d="M 44 50 Q 50 56 56 50" stroke="#be123c" strokeWidth="2" strokeLinecap="round" fill="#fda4af" />
          {/* Hands Resting on Card */}
          <ellipse cx="28" cy="74" rx="6.5" ry="5" fill="#ffdfba" stroke="#78350f" strokeWidth="1.2" />
          <ellipse cx="72" cy="74" rx="6.5" ry="5" fill="#ffdfba" stroke="#78350f" strokeWidth="1.2" />
        </svg>
      );

    case "mickey-mouse":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          {/* Magic Round Ears */}
          <circle cx="24" cy="22" r="16" fill="#000000" />
          <circle cx="76" cy="22" r="16" fill="#000000" />
          <circle cx="50" cy="48" r="28" fill="#000000" />
          <ellipse cx="50" cy="56" rx="20" ry="15" fill="#fed7aa" />
          {/* Eyes */}
          <ellipse cx="42" cy="42" rx="4" ry="9" fill="#ffffff" stroke="#000000" strokeWidth="1" />
          <ellipse cx="58" cy="42" rx="4" ry="9" fill="#ffffff" stroke="#000000" strokeWidth="1" />
          <circle cx="43" cy="44" r="2.5" fill="#000000" />
          <circle cx="57" cy="44" r="2.5" fill="#000000" />
          {/* Nose & Big Smile */}
          <ellipse cx="50" cy="52" rx="5" ry="3.5" fill="#000000" />
          <path d="M 38 58 Q 50 70 62 58" stroke="#000000" strokeWidth="2.5" fill="#e11d48" />
          {/* White Gloves on Card */}
          <ellipse cx="26" cy="74" rx="8" ry="6" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <ellipse cx="74" cy="74" rx="8" ry="6" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
        </svg>
      );

    default:
      // Default: Yellow Hoodie Boy (Exact Match to User's Uploaded Screenshot)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`filter drop-shadow-md overflow-visible ${className}`}
        >
          <defs>
            <radialGradient id="screenBoySkin" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffdfba" />
              <stop offset="100%" stopColor="#f5b988" />
            </radialGradient>
            <linearGradient id="screenYellowHoodie" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="60%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
            <linearGradient id="screenBlueDenim" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <linearGradient id="screenCap" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="70%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#15803d" />
            </linearGradient>
          </defs>

          {/* Yellow Hoodie & Denim Vest Torso */}
          <path
            d="M 25 66 C 25 55, 35 50, 50 50 C 65 50, 75 55, 75 66 L 78 88 C 78 92, 22 92, 22 88 Z"
            fill="url(#screenYellowHoodie)"
            stroke="#713f12"
            strokeWidth="1.5"
          />
          {/* Denim Vest Accents */}
          <path d="M 32 54 C 36 62, 38 74, 36 84 L 24 82 C 25 70, 28 60, 32 54 Z" fill="url(#screenBlueDenim)" />
          <path d="M 68 54 C 64 62, 62 74, 64 84 L 76 82 C 75 70, 72 60, 68 54 Z" fill="url(#screenBlueDenim)" />

          {/* White Shirt Collar */}
          <polygon points="50,62 44,52 56,52" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />

          {/* Boy Head & Face */}
          <ellipse cx="50" cy="38" rx="22" ry="20" fill="url(#screenBoySkin)" stroke="#78350f" strokeWidth="1.5" />

          {/* Anime Hair Bangs */}
          <path
            d="M 30 30 C 34 24, 40 30, 44 26 C 48 22, 52 28, 56 24 C 60 28, 66 24, 70 30 C 66 22, 58 20, 50 20 C 42 20, 34 22, 30 30 Z"
            fill="#5c381a"
          />

          {/* Big Expressive Anime Eyes */}
          <ellipse cx="40" cy="37" rx="5" ry="6.5" fill="#1e1b4b" />
          <ellipse cx="60" cy="37" rx="5" ry="6.5" fill="#1e1b4b" />
          <circle cx="38.5" cy="35" r="2.2" fill="#ffffff" />
          <circle cx="41.5" cy="39" r="1.1" fill="#ffffff" />
          <circle cx="58.5" cy="35" r="2.2" fill="#ffffff" />
          <circle cx="61.5" cy="39" r="1.1" fill="#ffffff" />

          {/* Cheerful Blush */}
          <ellipse cx="33" cy="42" rx="3.5" ry="2" fill="#f43f5e" opacity="0.6" />
          <ellipse cx="67" cy="42" rx="3.5" ry="2" fill="#f43f5e" opacity="0.6" />

          {/* Cute Smile */}
          <path d="M 44 44 Q 50 50 56 44" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" fill="#e11d48" />

          {/* Yellow Baseball Cap with Green Visor (Matching Screenshot) */}
          <path
            d="M 28 24 C 28 10, 72 10, 72 24 C 72 27, 28 27, 28 24 Z"
            fill="url(#screenCap)"
            stroke="#713f12"
            strokeWidth="1.5"
          />
          {/* Green Cap Visor Edge */}
          <path
            d="M 24 25 Q 50 18 76 25 L 73 29 Q 50 22 27 29 Z"
            fill="#15803d"
            stroke="#052e16"
            strokeWidth="1"
          />
          <circle cx="50" cy="11" r="2.5" fill="#ca8a04" stroke="#713f12" strokeWidth="1" />

          {/* Hands Resting/Gripping the Top Edge of the Card */}
          <ellipse cx="28" cy="74" rx="6.5" ry="4.5" fill="url(#screenBoySkin)" stroke="#78350f" strokeWidth="1.2" />
          <ellipse cx="72" cy="74" rx="6.5" ry="4.5" fill="url(#screenBoySkin)" stroke="#78350f" strokeWidth="1.2" />
        </svg>
      );
  }
}
