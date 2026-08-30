import {
  generateDueRenewalInvoices,
  markOverdueInvoices,
  suspendOverdueSubscriptions,
  reactivateClearedSubscriptions,
} from "@mashupkgrid/billing";

export async function handleGenerateInvoices(): Promise<void> {
  const result = await generateDueRenewalInvoices();
  console.log(
    `[billing] generate-invoices: processed=${result.processed} created=${result.affected} errors=${result.errors}`
  );
}

export async function handleMarkOverdueInvoices(): Promise<void> {
  const result = await markOverdueInvoices();
  console.log(`[billing] mark-overdue-invoices: marked=${result.affected}`);
}

export async function handleSuspendOverdueCustomers(): Promise<void> {
  const result = await suspendOverdueSubscriptions();
  console.log(`[billing] suspend-overdue-customers: suspended=${result.affected}`);
}

export async function handleReactivateClearedCustomers(): Promise<void> {
  const result = await reactivateClearedSubscriptions();
  console.log(`[billing] reactivate-cleared-customers: reactivated=${result.affected}`);
}
