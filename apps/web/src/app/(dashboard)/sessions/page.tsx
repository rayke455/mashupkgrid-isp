"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button, Card, Badge, StatusDot } from "@/components/ui";
import { IconSession } from "@/components/icons";

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch<SessionRow[]>("/api/v1/sessions"),
  });

  const revoke = useMutation({
    mutationFn: (sessionId: string) => apiFetch(`/api/v1/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
            <IconSession size={20} />
          </span>
          Active Login Sessions
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage your authenticated devices, IP addresses, and revoke active JWT refresh tokens.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading active sessions...</p>}

      <div className="space-y-3">
        {data?.map((session) => (
          <Card key={session.id} className="flex items-center justify-between py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-900 dark:text-white text-sm">
                  {session.userAgent ?? "Web Browser"}
                </p>
                {session.isCurrent && (
                  <Badge variant="success">
                    <StatusDot status="ONLINE" />
                    <span>Current Device</span>
                  </Badge>
                )}
              </div>
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                IP: {session.ipAddress ?? "Unknown"} · Last active: {new Date(session.lastUsedAt).toLocaleString()}
              </p>
            </div>

            {!session.isCurrent && (
              <Button
                variant="danger"
                className="text-xs py-1.5"
                onClick={() => revoke.mutate(session.id)}
                disabled={revoke.isPending}
              >
                Revoke Session
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
