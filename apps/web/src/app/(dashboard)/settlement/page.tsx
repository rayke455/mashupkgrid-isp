import { redirect } from "next/navigation";

/** The old Settlement page — superseded by Payments → Balance, which shows the same ledger with
 *  fees, refunds and settlement status, and lets the ISP request a settlement. */
export default function SettlementRedirect() {
  redirect("/payments/balance");
}
