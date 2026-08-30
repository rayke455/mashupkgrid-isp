import { CustomerAppShell } from "@/components/customer-app/CustomerAppShell";

export const metadata = {
  title: "FiberConnect — ISP Customer Super App",
  description: "Fast Internet. Reliable Service. One App. Manage your subscriptions, payments, and support seamlessly.",
};

export default function CustomerAppDefaultPage() {
  return <CustomerAppShell tenantSlug="demo-isp" initialBrandName="FiberConnect" />;
}
