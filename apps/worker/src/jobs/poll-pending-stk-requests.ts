import { pollPendingStkRequests } from "@mashupkgrid/payments";

export async function handlePollPendingStkRequests(): Promise<void> {
  const result = await pollPendingStkRequests();
  console.log(
    `[mpesa] poll-pending-stk-requests: checked=${result.checked} resolved=${result.resolved} errors=${result.errors}`
  );
  if (result.unresolvedSuccesses.length > 0) {
    // Safaricom confirms success but we have no receipt number (see the documented limitation
    // in packages/payments/src/mpesa/stk.service.ts) — surfaced loudly for operator follow-up.
    console.warn(
      `[mpesa] ${result.unresolvedSuccesses.length} STK request(s) confirmed successful by Safaricom but still awaiting a receipt number (no callback received yet): ${result.unresolvedSuccesses.join(", ")}`
    );
  }
}
