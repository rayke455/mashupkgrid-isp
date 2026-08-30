export function formatMoney(minorUnits: number, currency = "KES"): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(minorUnits / 100);
}

/** Converts a currency-major-unit form input (e.g. "1500.50") to integer minor units (150050). */
export function toMinorUnits(majorAmount: number): number {
  return Math.round(majorAmount * 100);
}
