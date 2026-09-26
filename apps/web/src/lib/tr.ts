import { SW } from "./tr-sw";

/**
 * Translates a fixed English phrase into the dashboard's current language, falling back to the
 * English text. LanguageProvider sets the language while it renders, before any page does, and the
 * dashboard remounts its content when the language changes, so every tr() call re-runs.
 */
let current: "en" | "sw" = "en";

export function setTrLanguage(lang: "en" | "sw"): void {
  current = lang;
}

export function tr(english: string): string {
  if (current === "en") return english;
  return SW[english] ?? english;
}
