"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { TenantOverview } from "./types";

export function useTenantOverview() {
  return useQuery({
    queryKey: ["tenant-payments", "overview"],
    queryFn: () => apiFetch<TenantOverview>("/api/v1/tenant-payments/overview"),
    refetchInterval: 60_000,
  });
}
