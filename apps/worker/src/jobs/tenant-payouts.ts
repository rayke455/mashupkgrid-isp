import { runTenantPayouts } from "@mashupkgrid/payments";

/**
 * Sends every tenant the balance this platform is holding for them.
 *
 * The minimum exists because each B2B call costs a transaction fee: remitting KES 12 would cost
 * more to send than it is worth, and the balance simply rolls into the next run. It is a floor on
 * the payout, never a cap — a tenant owed more is paid in full.
 */
const MINIMUM_PAYOUT_MINOR = 10000; // KES 100

export async function handleRunTenantPayouts(): Promise<void> {
  const result = await runTenantPayouts(MINIMUM_PAYOUT_MINOR);
  console.log(
    `[payouts] run complete: attempted=${result.attempted} accepted=${result.accepted} failed=${result.failed}`
  );
}
