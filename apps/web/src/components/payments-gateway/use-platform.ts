"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PlatformOverview, PlatformTenantRow } from "./types";

export function usePlatformOverview() {
  return useQuery({
    queryKey: ["platform-payments", "overview"],
    queryFn: () => apiFetch<PlatformOverview>("/api/v1/platform/payments/overview"),
    refetchInterval: 60_000,
  });
}

export function usePlatformTenants() {
  return useQuery({
    queryKey: ["platform-payments", "tenants"],
    queryFn: () => apiFetch<PlatformTenantRow[]>("/api/v1/platform/payments/tenants"),
  });
}

export function usePlatformGateway() {
  return useQuery({
    queryKey: ["platform-payments", "gateway"],
    queryFn: () =>
      apiFetch<{
        gatewayEnabled: boolean;
        collection: { configured: boolean; isActive: boolean; shortcode: string | null; environment: string };
        b2b: { configured: boolean; initiatorName: string | null };
        b2c: { configured: boolean; shortcode: string | null; initiatorName: string | null };
        callbackTokenConfigured: boolean;
        sandboxSettlements: boolean;
        callbackUrls: Record<string, string>;
      }>("/api/v1/platform/payments/gateway"),
  });
}
