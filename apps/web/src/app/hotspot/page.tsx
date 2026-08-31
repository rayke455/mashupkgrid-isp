import { redirect } from "next/navigation";
import { getDemoTenantSlug } from "@/lib/demo-portal";

export default function HotspotRootPage() {
  const demoTenantSlug = getDemoTenantSlug();
  if (!demoTenantSlug) {
    redirect("/");
  }
  redirect(`/hotspot/${demoTenantSlug}`);
}
