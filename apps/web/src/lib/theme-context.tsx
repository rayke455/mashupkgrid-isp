"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Dark or light dashboard, chosen from the header and remembered on the device. */
export type DashboardTheme = "dark" | "light";

const STORAGE_KEY = "mkg_theme";
const ThemeContext = createContext<{ theme: DashboardTheme; setTheme: (t: DashboardTheme) => void }>({ theme: "dark", setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DashboardTheme>("dark");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setThemeState(stored);
      else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) setThemeState("light");
    } catch {}
  }, []);
  const setTheme = (next: DashboardTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
