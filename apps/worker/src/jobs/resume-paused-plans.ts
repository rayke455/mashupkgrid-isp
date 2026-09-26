import type { AutomationSummary } from "@mashupkgrid/shared";
import { resumeDuePauses } from "@mashupkgrid/billing";

/** Turns paused plans back on when their pause ends. */
export async function handleResumePausedPlans(): Promise<AutomationSummary> {
  return resumeDuePauses();
}
