"use client";

import { MobileFieldTool } from "@/components/field-tech/mobile-field-tool";
import { PageHeader } from "@/components/dashboard/surface";

/** The installer's phone-sized view: today's jobs, customer details and PPPoE credentials. */
export default function FieldPage() {
  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader title="Field work" description="Installations and visits for technicians, sized for a phone." />
      <MobileFieldTool />
    </div>
  );
}
