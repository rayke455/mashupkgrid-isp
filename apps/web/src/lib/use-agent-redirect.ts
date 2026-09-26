"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/**
 * A shop agent signs in like anyone else and lands on the dashboard or the customer app; this
 * sends them on to their own app at /agent. Only asked for logins without staff permissions.
 * Returns true while it is still finding out, or on the way there.
 */
export function useAgentRedirect(enabled: boolean): boolean {
  const router = useRouter();
  const { data, isPending } = useQuery({
    queryKey: ["agent-me-check"],
    queryFn: () => apiFetch<{ id: string }>("/api/v1/agent/me").then(() => true).catch(() => false),
    enabled,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (data) router.replace("/agent");
  }, [data, router]);
  return enabled && (isPending || data === true);
}
