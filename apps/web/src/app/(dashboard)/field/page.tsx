"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { tr } from "@/lib/tr";
import { HintText, Input, Label } from "@/components/ui";
import { EmptyState, Notice, PageHeader, Panel, Pill, Segmented, darkButton } from "@/components/dashboard/surface";
import { JOB_TYPE_LABEL, STATUS_META, type JobRow } from "@/components/field-tech/job-meta";

/**
 * Field work: installations, repairs and surveys. Technicians see the jobs assigned to them, sized
 * for a phone; staff who can update customers also create and assign jobs here.
 */

interface CustomerOption {
  id: string;
  fullName: string;
  customerNumber: string;
}

const selectClass = "w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-slate-100";

export default function FieldPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("customers.update") ?? false;
  const [status, setStatus] = useState<"ACTIVE" | "DONE">("ACTIVE");
  const [mine, setMine] = useState(!canManage);
  const [showForm, setShowForm] = useState(false);
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs", status, mine],
    queryFn: () => apiFetch<JobRow[]>(`/api/v1/jobs?status=${status}${mine ? "&mine=true" : ""}`),
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
      <PageHeader
        title={tr("Field work")}
        description={tr("Installations, repairs and site visits. Open a job on your phone to start it, add photos and close it with the customer's signature.")}
        actions={
          canManage ? (
            <button type="button" className={darkButton(showForm ? "secondary" : "primary")} onClick={() => setShowForm((v) => !v)}>
              {showForm ? tr("Cancel") : tr("New job")}
            </button>
          ) : undefined
        }
      />

      {showForm && <NewJobForm onDone={() => setShowForm(false)} />}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={tr("Status")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "ACTIVE", label: tr("To do") },
            { value: "DONE", label: tr("Done") },
          ]}
        />
        {canManage && (
          <Segmented
            label={tr("Whose")}
            value={mine ? "mine" : "all"}
            onChange={(v) => setMine(v === "mine")}
            options={[
              { value: "all", label: tr("All jobs") },
              { value: "mine", label: tr("Mine") },
            ]}
          />
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">{tr("Loading…")}</p>
      ) : !jobs?.length ? (
        <Panel title={status === "ACTIVE" ? tr("Nothing to do") : tr("No finished jobs")}>
          <EmptyState title={status === "ACTIVE" ? tr("No open jobs") : tr("None yet")}>
            {canManage ? tr("Create a job and assign it to a technician. They get an alert on their phone.") : tr("Jobs assigned to you appear here.")}
          </EmptyState>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const meta = STATUS_META[j.status];
            const where = j.address ?? j.customer?.address;
            return (
              <li key={j.id}>
                <Link
                  href={`/field/${j.id}`}
                  className="block rounded-xl border border-obsidian-800 bg-obsidian-900 p-4 transition-colors hover:border-brand-500/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">
                        {j.number} · {tr(JOB_TYPE_LABEL[j.type])}
                      </p>
                      <p className="mt-0.5 font-medium text-white">{j.title}</p>
                      {j.customer && <p className="text-sm text-slate-300">{j.customer.fullName}</p>}
                      {where && <p className="truncate text-sm text-slate-400">{where}</p>}
                    </div>
                    <Pill tone={meta.tone}>{tr(meta.label)}</Pill>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {j.scheduledFor ? new Date(j.scheduledFor).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : tr("No time set")}
                    {j.assignedTo ? ` · ${j.assignedTo.email}` : ` · ${tr("Not assigned")}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewJobForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<JobRow["type"]>("INSTALLATION");
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [address, setAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: techs } = useQuery({ queryKey: ["job-technicians"], queryFn: () => apiFetch<{ id: string; email: string }[]>("/api/v1/jobs/technicians") });
  const { data: customers } = useQuery({
    queryKey: ["job-customer-search", search],
    queryFn: () => apiFetch<{ items: CustomerOption[] }>(`/api/v1/customers?limit=20${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify({
          type,
          title: title.trim(),
          notes: notes.trim() || null,
          customerId: customerId || null,
          address: address.trim() || null,
          contactPhone: contactPhone.trim() || null,
          assignedToUserId: assignedToUserId || null,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate();
  };

  return (
    <Panel title={tr("New job")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="j-type">{tr("Type")}</Label>
            <select id="j-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as JobRow["type"])}>
              {(Object.keys(JOB_TYPE_LABEL) as JobRow["type"][]).map((k) => (
                <option key={k} value={k}>
                  {tr(JOB_TYPE_LABEL[k])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="j-when">{tr("When")}</Label>
            <Input id="j-when" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="j-title">{tr("What needs doing")}</Label>
          <Input id="j-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("e.g. Install fibre and ONT")} required minLength={3} maxLength={120} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="j-customer">{tr("Customer (optional)")}</Label>
            <Input id="j-search" aria-label={tr("Search customers")} placeholder={tr("Search name or phone")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select id="j-customer" className={`${selectClass} mt-2`} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{tr("No customer yet")}</option>
              {customers?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.customerNumber})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="j-tech">{tr("Technician")}</Label>
            <select id="j-tech" className={selectClass} value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
              <option value="">{tr("Not assigned")}</option>
              {techs?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.email}
                </option>
              ))}
            </select>
            <HintText>{tr("They get a push alert if they turned alerts on.")}</HintText>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="j-address">{tr("Address or landmark")}</Label>
            <Input id="j-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={tr("e.g. Kasarani, next to Seasons Mall")} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="j-phone">{tr("Contact phone")}</Label>
            <Input id="j-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0712345678" maxLength={20} />
          </div>
        </div>
        <div>
          <Label htmlFor="j-notes">{tr("Notes for the technician")}</Label>
          <textarea id="j-notes" rows={3} className={selectClass} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end">
          <button type="submit" className={darkButton("primary")} disabled={create.isPending}>
            {create.isPending ? tr("Saving…") : tr("Create job")}
          </button>
        </div>
      </form>
    </Panel>
  );
}
