import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app/CustomerAppShell";
import { getDemoTenantSlug } from "@/lib/demo-portal";

export const metadata = {
  title: "FiberConnect — ISP Customer Super App",
  description: "Fast Internet. Reliable Service. One App. Manage your subscriptions, payments, and support seamlessly.",
};

export default function CustomerAppDefaultPage() {
  const tenantSlug = getDemoTenantSlug();
  if (!tenantSlug) {
    redirect("/");
  }
  return <CustomerAppShell tenantSlug={tenantSlug} initialBrandName="FiberConnect" />;
}
