import { CustomerMobileApp } from "@/components/customer-mobile-app";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

/** The same app, with the ISP known up front so sign-in goes to the right account. */
export default async function CustomerAppTenantPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  return <CustomerMobileApp tenantSlug={tenantSlug} />;
}
