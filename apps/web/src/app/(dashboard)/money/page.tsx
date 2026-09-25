import { redirect } from "next/navigation";

/** The old Money management page — superseded by Super Admin → Payments, which adds fees,
 *  approvals, manual and B2C settlements, reconciliation and a full audit trail. */
export default function MoneyRedirect() {
  redirect("/admin/payments/settlements");
}
