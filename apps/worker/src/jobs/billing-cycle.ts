import {
  generateDueRenewalInvoices,
  markOverdueInvoices,
  suspendOverdueSubscriptions,
  reactivateClearedSubscriptions,
} from "@mashupkgrid/billing";
import type { AutomationSummary } from "@mashupkgrid/shared";

// Each handler returns its counters (keyed as the automation catalog in packages/shared
// documents them) so the run record the dashboard shows matches the log line.

export async function handleGenerateInvoices(): Promise<AutomationSummary> {
  const result = await generateDueRenewalInvoices();
  console.log(
    `[billing] generate-invoices: processed=${result.processed} created=${result.affected} errors=${result.errors}`
  );
  return { processed: result.processed, created: result.affected, errors: result.errors };
}

export async function handleMarkOverdueInvoices(): Promise<AutomationSummary> {
  const result = await markOverdueInvoices();
  console.log(`[billing] mark-overdue-invoices: marked=${result.affected}`);
  return { marked: result.affected };
}

export async function handleSuspendOverdueCustomers(): Promise<AutomationSummary> {
  const result = await suspendOverdueSubscriptions();
  console.log(`[billing] suspend-overdue-customers: suspended=${result.affected}`);
  return { suspended: result.affected };
}

export async function handleReactivateClearedCustomers(): Promise<AutomationSummary> {
  const result = await reactivateClearedSubscriptions();
  console.log(`[billing] reactivate-cleared-customers: reactivated=${result.affected}`);
  return { reactivated: result.affected };
}
