"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, Badge } from "@/components/ui";
import { IconLifeBuoy } from "@/components/icons";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

interface TicketMessage {
  id: string;
  body: string;
  authorUserId: string | null;
  authorLabel: string | null;
  isInternalNote: boolean;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  customerId: string | null;
  assignedToUserId: string | null;
  createdAt: string;
  messages: TicketMessage[];
}

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const PRIORITY_OPTIONS: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

function statusVariant(status: TicketStatus): "success" | "warning" | "neutral" | "info" {
  if (status === "OPEN") return "warning";
  if (status === "IN_PROGRESS") return "info";
  if (status === "RESOLVED") return "success";
  return "neutral";
}

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const queryClient = useQueryClient();
  const [replyBody, setReplyBody] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => apiFetch<TicketDetail>(`/api/v1/tickets/${ticketId}`),
  });

  const reply = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: replyBody.trim(), isInternalNote }),
      }),
    onSuccess: () => {
      setReplyBody("");
      setIsInternalNote(false);
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to send reply"),
  });

  const update = useMutation({
    mutationFn: (patch: { status?: TicketStatus; priority?: TicketPriority }) =>
      apiFetch(`/api/v1/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to update ticket"),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading ticket...</p>;
  if (!ticket) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <IconLifeBuoy size={20} />
            </span>
            {ticket.subject}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {ticket.customerId
              ? "From a subscriber"
              : `From ${ticket.contactName ?? "an unlinked contact"}${ticket.contactPhone ? ` · ${ticket.contactPhone}` : ""}${ticket.contactEmail ? ` · ${ticket.contactEmail}` : ""}`}
            {" · "}
            {ticket.source.replace("_", " ")} · Opened {new Date(ticket.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge variant={statusVariant(ticket.status)}>{ticket.status.replace("_", " ")}</Badge>
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase">Status</span>
          <select
            value={ticket.status}
            onChange={(e) => update.mutate({ status: e.target.value as TicketStatus })}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-obsidian-700 dark:bg-obsidian-950"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase">Priority</span>
          <select
            value={ticket.priority}
            onChange={(e) => update.mutate({ priority: e.target.value as TicketPriority })}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-obsidian-700 dark:bg-obsidian-950"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="space-y-3">
        {ticket.messages.map((msg) => (
          <Card
            key={msg.id}
            className={
              msg.isInternalNote
                ? "border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20"
                : msg.authorUserId
                  ? "bg-slate-50 dark:bg-obsidian-900"
                  : "border-brand-400/40 bg-brand-50/30 dark:bg-brand-950/20"
            }
          >
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">
                {msg.isInternalNote ? "🔒 Internal note" : msg.authorUserId ? "Staff" : msg.authorLabel ?? "Customer"}
              </span>
              <span>{new Date(msg.createdAt).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{msg.body}</p>
          </Card>
        ))}
      </div>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            reply.mutate();
          }}
          className="space-y-3"
        >
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={4}
            placeholder="Write a reply..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
            required
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={isInternalNote}
                onChange={(e) => setIsInternalNote(e.target.checked)}
              />
              Internal note (not visible to the customer)
            </label>
            <Button type="submit" disabled={reply.isPending || !replyBody.trim()} className="px-4 py-1.5 text-xs">
              {reply.isPending ? "Sending..." : isInternalNote ? "Add Note" : "Send Reply"}
            </Button>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </form>
      </Card>
    </div>
  );
}
