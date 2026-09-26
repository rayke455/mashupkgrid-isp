"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setTrLanguage } from "./tr";
import { loadPortalLanguage, savePortalLanguage, type PortalLanguage } from "./portal-strings";

/**
 * The signed-in app's language (EN/SW), chosen from the header and remembered on the device
 * under the same key the captive portal uses, so one choice follows a person everywhere.
 */
interface LanguageContextValue {
  lang: PortalLanguage;
  setLang: (lang: PortalLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue>({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PortalLanguage>("en");
  useEffect(() => {
    const stored = loadPortalLanguage();
    if (stored) setLangState(stored);
  }, []);
  // Set before any child renders, so tr() calls in this render pass use the chosen language.
  setTrLanguage(lang);
  const setLang = (next: PortalLanguage) => {
    setLangState(next);
    savePortalLanguage(next);
  };
  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
