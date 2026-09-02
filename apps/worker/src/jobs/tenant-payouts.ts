import { runTenantPayouts, getPayoutMinimumMinor } from "@mashupkgrid/payments";

/**
 * Sends every tenant the balance this platform is holding for them.
 *
 * The floor is read fresh each run from the platform settings, so a super admin changing it takes
 * effect on the next hour rather than needing a redeploy. Default is 1 cent — everything
 * collected is remitted — and a balance under the floor is not lost, it rolls into the next run.
 */
export async function handleRunTenantPayouts(): Promise<void> {
  const minimumMinor = await getPayoutMinimumMinor();
  const result = await runTenantPayouts(minimumMinor);
  console.log(
    `[payouts] run complete: minimum=${minimumMinor} attempted=${result.attempted} accepted=${result.accepted} failed=${result.failed}`
  );
}
