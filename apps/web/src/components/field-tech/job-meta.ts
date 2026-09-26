/** Shared shapes and labels for field job cards. */

export interface JobRow {
  id: string;
  number: string;
  type: "INSTALLATION" | "REPAIR" | "SURVEY" | "RELOCATION" | "REMOVAL";
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  title: string;
  address: string | null;
  contactPhone: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  customer: { id: string; fullName: string; phone: string; customerNumber: string; address: string | null } | null;
  assignedTo: { id: string; email: string } | null;
  _count: { attachments: number };
}

export const JOB_TYPE_LABEL: Record<JobRow["type"], string> = {
  INSTALLATION: "Installation",
  REPAIR: "Repair",
  SURVEY: "Site survey",
  RELOCATION: "Relocation",
  REMOVAL: "Removal",
};

export const STATUS_META: Record<JobRow["status"], { label: string; tone: "neutral" | "warn" | "good" | "bad" }> = {
  OPEN: { label: "To do", tone: "neutral" },
  IN_PROGRESS: { label: "On site", tone: "warn" },
  DONE: { label: "Done", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
};
