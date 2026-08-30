"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { IconMaintenance } from "@/components/icons";

interface MaintenanceStatus {
  enabled: boolean;
  level: number;
  message: string | null;
  endAt: string | null;
}

export function MaintenanceBanner() {
  const { data } = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: () => apiFetch<MaintenanceStatus>("/api/v1/platform/maintenance/status", { skipAuth: true }),
    refetchInterval: 60_000,
  });

  if (!data?.enabled) return null;

  return (
    <div className="w-full bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-amber-950 shadow-sm flex items-center justify-center gap-2">
      <IconMaintenance size={14} />
      <span>
        {data.message ?? `Platform undergoing maintenance (Level ${data.level}).`}
        {data.endAt ? ` Expected completion: ${new Date(data.endAt).toLocaleTimeString()}.` : ""}
      </span>
    </div>
  );
}
