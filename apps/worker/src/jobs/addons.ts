import type { AutomationSummary } from "@mashupkgrid/shared";
import { sweepAddOns } from "@mashupkgrid/billing";

/** Starts paid add-ons, ends finished ones and cancels ones left unpaid. */
export async function handleSweepAddOns(): Promise<AutomationSummary> {
  return sweepAddOns();
}
