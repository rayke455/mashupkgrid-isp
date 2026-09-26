"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { currentPosition, resizeImage } from "@/lib/image";
import { tr } from "@/lib/tr";
import { HintText, Input, Label } from "@/components/ui";
import { Notice, Panel, Pill, darkButton } from "@/components/dashboard/surface";
import { AuthImage } from "@/components/field-tech/auth-image";
import { SignaturePad } from "@/components/field-tech/signature-pad";
import { JOB_TYPE_LABEL, STATUS_META, type JobRow } from "@/components/field-tech/job-meta";

/**
 * One job, on the technician's phone: who and where, start on arrival (with GPS), photos of the
 * work, the equipment fitted, and the customer's signature to close it.
 */

interface JobDetail extends Omit<JobRow, "customer"> {
  notes: string | null;
  startedAt: string | null;
  equipment: string | null;
  completionNotes: string | null;
  signedByName: string | null;
  latitude: number | null;
  longitude: number | null;
  customer: (JobRow["customer"] & { gpsLat: number | null; gpsLng: number | null }) | null;
  attachments: { id: string; kind: "PHOTO" | "SIGNATURE"; createdAt: string }[];
}

const areaClass = "w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-slate-100";

function mapsLink(job: JobDetail): string | null {
  const lat = job.customer?.gpsLat ?? job.latitude;
  const lng = job.customer?.gpsLng ?? job.longitude;
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const address = job.address ?? job.customer?.address;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

export default function JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const canManage = user?.permissions.includes("customers.update") ?? false;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [equipment, setEquipment] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

  const { data: job, isLoading } = useQuery({ queryKey: ["job", jobId], queryFn: () => apiFetch<JobDetail>(`/api/v1/jobs/${jobId}`) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
  };
  const fail = (err: unknown) => setError(err instanceof ApiRequestError || err instanceof Error ? err.message : String(err));

  const start = useMutation({
    mutationFn: async () => apiFetch(`/api/v1/jobs/${jobId}/start`, { method: "POST", body: JSON.stringify((await currentPosition()) ?? {}) }),
    onSuccess: refresh,
    onError: fail,
  });

  const cancel = useMutation({
    mutationFn: () => apiFetch(`/api/v1/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }),
    onSuccess: refresh,
    onError: fail,
  });

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy("photos");
    try {
      for (const file of Array.from(files)) {
        const { base64, mimeType } = await resizeImage(file);
        await apiFetch(`/api/v1/jobs/${jobId}/attachments`, { method: "POST", body: JSON.stringify({ kind: "PHOTO", mimeType, dataBase64: base64 }) });
      }
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto(attachmentId: string) {
    setError(null);
    try {
      await apiFetch(`/api/v1/jobs/${jobId}/attachments/${attachmentId}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function complete() {
    setError(null);
    setBusy("complete");
    try {
      if (signature) {
        await apiFetch(`/api/v1/jobs/${jobId}/attachments`, { method: "POST", body: JSON.stringify({ kind: "SIGNATURE", mimeType: "image/png", dataBase64: signature }) });
      }
      const position = await currentPosition(5000);
      await apiFetch(`/api/v1/jobs/${jobId}/complete`, {
        method: "POST",
        body: JSON.stringify({ equipment: equipment.trim() || null, completionNotes: completionNotes.trim() || null, signedByName: signedByName.trim() || null, ...(position ?? {}) }),
      });
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !job) return <p className="text-sm text-slate-400">{tr("Loading…")}</p>;

  const meta = STATUS_META[job.status];
  const photos = job.attachments.filter((a) => a.kind === "PHOTO");
  const signatureAttachment = job.attachments.find((a) => a.kind === "SIGNATURE");
  const open = job.status === "OPEN" || job.status === "IN_PROGRESS";
  const map = mapsLink(job);
  const phone = job.contactPhone ?? job.customer?.phone;
  const needsSignature = job.type === "INSTALLATION" && !signatureAttachment;

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5">
      <Link href="/field" className="text-sm text-slate-400 hover:underline">
        ← {tr("All jobs")}
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">
            {job.number} · {tr(JOB_TYPE_LABEL[job.type])}
          </p>
          <h1 className="text-xl font-semibold text-white">{job.title}</h1>
          {job.scheduledFor && <p className="text-sm text-slate-400">{new Date(job.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>}
        </div>
        <Pill tone={meta.tone}>{tr(meta.label)}</Pill>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <Panel title={tr("Where and who")}>
        <div className="space-y-2 text-sm">
          {job.customer && (
            <p>
              <Link href={`/customers/${job.customer.id}`} className="font-medium text-white hover:underline">
                {job.customer.fullName}
              </Link>{" "}
              <span className="text-slate-400">({job.customer.customerNumber})</span>
            </p>
          )}
          {(job.address ?? job.customer?.address) && <p className="text-slate-300">{job.address ?? job.customer?.address}</p>}
          {job.notes && <p className="whitespace-pre-line rounded-lg bg-obsidian-950 p-3 text-slate-300">{job.notes}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {phone && (
              <a href={`tel:${phone}`} className={darkButton("secondary", "sm")}>
                {tr("Call")} {phone}
              </a>
            )}
            {map && (
              <a href={map} target="_blank" rel="noreferrer" className={darkButton("secondary", "sm")}>
                {tr("Open in Maps")}
              </a>
            )}
          </div>
        </div>
      </Panel>

      {job.status === "OPEN" && (
        <button type="button" className={`${darkButton("primary")} w-full justify-center py-3`} disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? tr("Starting…") : tr("I have arrived, start the job")}
        </button>
      )}

      <Panel title={`${tr("Photos")} (${photos.length}/8)`}>
        {photos.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative">
                <AuthImage path={`/api/v1/jobs/${jobId}/attachments/${p.id}`} alt={tr("Job photo")} className="aspect-square w-full rounded-lg object-cover" />
                {open && (
                  <button type="button" onClick={() => removePhoto(p.id)} className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white" aria-label={tr("Remove")}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {open ? (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
            <button type="button" className={darkButton("secondary")} disabled={busy === "photos" || photos.length >= 8} onClick={() => fileRef.current?.click()}>
              {busy === "photos" ? tr("Uploading…") : tr("Take or add photos")}
            </button>
            <HintText>{tr("Photos are shrunk on the phone before upload, so they send quickly on mobile data.")}</HintText>
          </>
        ) : (
          photos.length === 0 && <p className="text-sm text-slate-400">{tr("No photos.")}</p>
        )}
      </Panel>

      {open ? (
        <Panel title={tr("Close the job")}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="j-equipment">{tr("Equipment fitted")}</Label>
              <Input id="j-equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder={tr("e.g. ONT HWTC89A120FC, 30 m drop cable")} maxLength={300} />
            </div>
            <div>
              <Label htmlFor="j-done-notes">{tr("What was done")}</Label>
              <textarea id="j-done-notes" rows={3} className={areaClass} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} maxLength={2000} />
            </div>
            <div>
              <Label>{tr("Customer signature")}</Label>
              {signatureAttachment && !signature && (
                <AuthImage path={`/api/v1/jobs/${jobId}/attachments/${signatureAttachment.id}`} alt={tr("Customer signature")} className="mb-2 h-24 rounded-lg bg-white" />
              )}
              <SignaturePad onChange={setSignature} clearLabel={tr("Clear")} />
              <Input className="mt-2" aria-label={tr("Signed by")} placeholder={tr("Name of the person signing")} value={signedByName} onChange={(e) => setSignedByName(e.target.value)} maxLength={100} />
              {needsSignature && !signature && <HintText>{tr("An installation needs the customer's signature before it can be closed.")}</HintText>}
            </div>
            <button
              type="button"
              className={`${darkButton("primary")} w-full justify-center py-3`}
              disabled={busy === "complete" || (needsSignature && !signature)}
              onClick={complete}
            >
              {busy === "complete" ? tr("Saving…") : tr("Close job")}
            </button>
            {canManage && job.status === "OPEN" && (
              <button
                type="button"
                className="w-full text-center text-sm text-rose-400 underline"
                onClick={() => {
                  if (confirm(tr("Cancel this job?"))) cancel.mutate();
                }}
              >
                {tr("Cancel job")}
              </button>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title={job.status === "DONE" ? tr("Closed") : tr("Cancelled")}>
          <dl className="space-y-2 text-sm">
            {job.completedAt && (
              <div>
                <dt className="text-xs text-slate-400">{tr("Finished")}</dt>
                <dd className="text-white">{new Date(job.completedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</dd>
              </div>
            )}
            {job.equipment && (
              <div>
                <dt className="text-xs text-slate-400">{tr("Equipment fitted")}</dt>
                <dd className="text-white">{job.equipment}</dd>
              </div>
            )}
            {job.completionNotes && (
              <div>
                <dt className="text-xs text-slate-400">{tr("What was done")}</dt>
                <dd className="whitespace-pre-line text-white">{job.completionNotes}</dd>
              </div>
            )}
            {signatureAttachment && (
              <div>
                <dt className="text-xs text-slate-400">
                  {tr("Signed by")} {job.signedByName ?? ""}
                </dt>
                <dd>
                  <AuthImage path={`/api/v1/jobs/${jobId}/attachments/${signatureAttachment.id}`} alt={tr("Customer signature")} className="mt-1 h-24 rounded-lg bg-white" />
                </dd>
              </div>
            )}
          </dl>
        </Panel>
      )}
    </div>
  );
}
