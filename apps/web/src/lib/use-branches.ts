"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface Branch {
  id: string;
  name: string;
  location: string | null;
  routers: number;
  customers: number;
  staff: number;
}

/** The ISP's branches, shared by every page that filters or assigns by branch. */
export function useBranches(enabled = true) {
  const { data } = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<Branch[]>("/api/v1/branches"), enabled, staleTime: 60_000 });
  const branches = data ?? [];
  const nameOf = (id: string | null | undefined) => (id ? branches.find((b) => b.id === id)?.name ?? null : null);
  return { branches, nameOf };
}
