import { prisma } from "@mashupkgrid/database";
import { queryAndReconcileStkRequest } from "./stk.service.js";

export interface PollResult {
  checked: number;
  resolved: number;
  unresolvedSuccesses: string[];
  errors: number;
}

/**
 * Defensive poll for lost/delayed STK callbacks (docs/architecture/10-phase3-plan.md). Checks
 * every PENDING `MpesaStkRequest` older than `olderThanMs` against Safaricom's Query API.
 * `unresolvedSuccesses` lists checkoutRequestIds Safaricom reports as successful but for which
 * we have no receipt number yet (see the limitation documented in `stk.service.ts`) — these
 * need operator attention if they never resolve via a real callback.
 */
export async function pollPendingStkRequests(olderThanMs = 2 * 60 * 1000): Promise<PollResult> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const pending = await prisma.mpesaStkRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { tenantId: true, checkoutRequestId: true },
  });

  let resolved = 0;
  let errors = 0;
  const unresolvedSuccesses: string[] = [];

  for (const { tenantId, checkoutRequestId } of pending) {
    try {
      const { request, unresolvedSuccess } = await queryAndReconcileStkRequest(tenantId, checkoutRequestId);
      if (unresolvedSuccess) {
        unresolvedSuccesses.push(checkoutRequestId);
      } else if (request.status !== "PENDING") {
        resolved += 1;
      }
    } catch (err) {
      errors += 1;
      // eslint-disable-next-line no-console
      console.error(`[mpesa] failed to poll STK request ${checkoutRequestId}`, err);
    }
  }

  return { checked: pending.length, resolved, unresolvedSuccesses, errors };
}
