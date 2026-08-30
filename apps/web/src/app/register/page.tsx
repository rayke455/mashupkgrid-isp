"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { IspRegistrationWizard } from "@/components/auth/isp-registration-wizard";
import { CustomerRegistrationForm } from "@/components/auth/customer-registration-form";

function RegisterContent() {
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenant");

  if (tenantSlug) {
    return <CustomerRegistrationForm tenantSlug={tenantSlug} />;
  }

  return <IspRegistrationWizard />;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <RegisterContent />
    </Suspense>
  );
}


