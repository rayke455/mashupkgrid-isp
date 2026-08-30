"use client";

import { useSearchParams } from "next/navigation";
import { IspRegistrationWizard } from "@/components/auth/isp-registration-wizard";
import { CustomerRegistrationForm } from "@/components/auth/customer-registration-form";

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenant");

  if (tenantSlug) {
    return <CustomerRegistrationForm tenantSlug={tenantSlug} />;
  }

  return <IspRegistrationWizard />;
}

