import { CustomerAppShell } from "@/components/customer-app/CustomerAppShell";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function CustomerAppTenantPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const brandName = tenantSlug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return <CustomerAppShell tenantSlug={tenantSlug} initialBrandName={brandName || "FiberConnect"} />;
}
