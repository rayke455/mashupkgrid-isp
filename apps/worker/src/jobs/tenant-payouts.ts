import { runScheduledSettlements } from "@mashupkgrid/payments";

/**
 * Creates and dispatches tenant settlements according to the platform's settlement policy
 * (Super Admin → Payments → Fees & settlement).
 *
 * The job ticks every few minutes; whether it does anything is decided by runScheduledSettlements:
 * INSTANT settles whatever is owed on every tick, DAILY/WEEKLY only once their slot has passed and
 * been claimed (so a restart or two workers can never run the same slot twice), MANUAL never.
 * Balances below the configured minimum roll over to the next run — nothing is lost.
 */
export async function handleRunTenantPayouts(): Promise<void> {
  const result = await runScheduledSettlements();
  if (result.ran) {
    console.log(
      `[settlements] run complete: created=${result.created} skipped=${result.skipped} failed=${result.failed}`
    );
  }
}
